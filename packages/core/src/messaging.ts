import nodemailer from "nodemailer";
import type { JobOptions } from "./types";

export type Recipient = string | string[];
export type AttachmentData = string | ArrayBuffer | Uint8Array | Blob;
export type MailAttachment = {
  filename: string;
  data: AttachmentData;
  contentType?: string;
};
export type MailMessage = {
  to: Recipient;
  from?: string;
  replyTo?: string;
  cc?: Recipient;
  bcc?: Recipient;
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
};
export type SmsMessage = { to: string; from?: string; text: string };
export type DeliveryResult = {
  id: string;
  status: "sent" | "logged";
  provider: string;
};
export type AuditReference = { type: string; id?: string | number | bigint };
export type DeliveryAudit = {
  actor?: AuditReference;
  subject?: AuditReference;
};
export type SendLaterOptions = JobOptions & { audit?: DeliveryAudit };
export type AuditRecorder = (
  event: string,
  options: {
    actor?: AuditReference;
    subject?: AuditReference;
    metadata?: Record<string, unknown>;
  },
) => Promise<unknown>;
export interface MailDriver {
  readonly name: string;
  send(message: MailMessage): Promise<DeliveryResult>;
}
export interface SmsDriver {
  readonly name: string;
  send(message: SmsMessage): Promise<DeliveryResult>;
}

type DeliveryContext = { audit?: DeliveryAudit; auditFailure?: boolean };
type MailQueuePayload = { message: MailMessage; audit?: DeliveryAudit };
type SmsQueuePayload = { message: SmsMessage; audit?: DeliveryAudit };

const recipients = (value: Recipient | undefined) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(?:bearer|basic)\s+[a-z0-9+/=._-]+/gi, "[REDACTED]")
    .replace(
      /(?:token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 500);
}

async function attachmentBase64(data: AttachmentData) {
  if (typeof data === "string") return data;
  const bytes =
    data instanceof Blob
      ? new Uint8Array(await data.arrayBuffer())
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data;
  return Buffer.from(bytes).toString("base64");
}

async function serializableMail(message: MailMessage): Promise<MailMessage> {
  if (!message.attachments) return message;
  return {
    ...message,
    attachments: await Promise.all(
      message.attachments.map(async (attachment) => ({
        ...attachment,
        data: await attachmentBase64(attachment.data),
      })),
    ),
  };
}

export function consoleMailDriver(environment = Bun.env.NODE_ENV): MailDriver {
  return {
    name: "console",
    async send(message) {
      if (environment === "production")
        throw new Error(
          "[Bunway Mail] Console delivery is unavailable in production. Configure MAIL_DRIVER=resend or MAIL_DRIVER=smtp.",
        );
      const text =
        message.text ??
        (message.html ? "[HTML message omitted from console output]" : "");
      console.log(
        `[Bunway Mail - Development]\n\nTo: ${recipients(message.to)?.join(", ")}\nSubject: ${message.subject}\n\n${text}\n\nNo mail provider is configured.\n\nThis message was written to the development console instead of being delivered.\n\nConfigure a mail provider to enable actual delivery.`,
      );
      return {
        id: `dev_${crypto.randomUUID()}`,
        status: "logged",
        provider: "console",
      };
    },
  };
}

export function resendMailDriver(options: {
  apiKey: string;
  defaultFrom?: string;
  fetch?: typeof globalThis.fetch;
}): MailDriver {
  if (!options.apiKey)
    throw new Error(
      "[Bunway Mail] Resend is configured but RESEND_API_KEY is missing.",
    );
  const request = options.fetch ?? globalThis.fetch;
  return {
    name: "resend",
    async send(message) {
      const from = message.from ?? options.defaultFrom;
      if (!from)
        throw new Error(
          "[Bunway Mail] Resend requires MAIL_FROM or message.from.",
        );
      const attachments = message.attachments
        ? await Promise.all(
            message.attachments.map(async (item) => ({
              filename: item.filename,
              content: await attachmentBase64(item.data),
              content_type: item.contentType,
            })),
          )
        : undefined;
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
          "user-agent": "Bunway/0.1",
        },
        body: JSON.stringify({
          ...message,
          from,
          to: recipients(message.to),
          cc: recipients(message.cc),
          bcc: recipients(message.bcc),
          reply_to: message.replyTo,
          replyTo: undefined,
          attachments,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };
      if (!response.ok)
        throw new Error(
          `[Bunway Mail] Resend rejected the message (${response.status}): ${body.message ?? body.name ?? "Unknown provider error"}`,
        );
      if (!body.id)
        throw new Error("[Bunway Mail] Resend returned no message ID.");
      return { id: body.id, status: "sent", provider: "resend" };
    },
  };
}

export function smtpMailDriver(options: {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  secure?: boolean;
  defaultFrom?: string;
  transport?: Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail">;
}): MailDriver {
  if (!options.host)
    throw new Error(
      "[Bunway Mail] SMTP is configured but SMTP_HOST is missing.",
    );
  const transport =
    options.transport ??
    nodemailer.createTransport({
      host: options.host,
      port: options.port ?? (options.secure ? 465 : 587),
      secure: options.secure ?? false,
      auth: options.username
        ? { user: options.username, pass: options.password }
        : undefined,
    });
  return {
    name: "smtp",
    async send(message) {
      const from = message.from ?? options.defaultFrom;
      if (!from)
        throw new Error(
          "[Bunway Mail] SMTP requires MAIL_FROM or message.from.",
        );
      const result = await transport.sendMail({
        ...message,
        from,
        attachments: message.attachments
          ? await Promise.all(
              message.attachments.map(async (item) => ({
                filename: item.filename,
                content: Buffer.from(
                  await attachmentBase64(item.data),
                  "base64",
                ),
                contentType: item.contentType,
              })),
            )
          : undefined,
      });
      return { id: result.messageId, status: "sent", provider: "smtp" };
    },
  };
}

export function consoleSmsDriver(environment = Bun.env.NODE_ENV): SmsDriver {
  return {
    name: "console",
    async send(message) {
      if (environment === "production")
        throw new Error(
          "[Bunway SMS] Console delivery is unavailable in production. Configure SMS_DRIVER=twilio.",
        );
      console.log(
        `[Bunway SMS - Development]\n\nTo: ${message.to}\n\n${message.text}\n\nNo SMS provider is configured.\n\nThis message was written to the development console instead of being delivered.\n\nConfigure an SMS provider to enable actual delivery.`,
      );
      return {
        id: `dev_${crypto.randomUUID()}`,
        status: "logged",
        provider: "console",
      };
    },
  };
}

export function twilioSmsDriver(options: {
  accountSid: string;
  authToken: string;
  defaultFrom?: string;
  fetch?: typeof globalThis.fetch;
}): SmsDriver {
  if (!options.accountSid)
    throw new Error(
      "[Bunway SMS] Twilio is configured but TWILIO_ACCOUNT_SID is missing.",
    );
  if (!options.authToken)
    throw new Error(
      "[Bunway SMS] Twilio is configured but TWILIO_AUTH_TOKEN is missing.",
    );
  const request = options.fetch ?? globalThis.fetch;
  return {
    name: "twilio",
    async send(message) {
      const from = message.from ?? options.defaultFrom;
      if (!from)
        throw new Error(
          "[Bunway SMS] Twilio requires TWILIO_FROM or message.from.",
        );
      const form = new URLSearchParams({
        To: message.to,
        From: from,
        Body: message.text,
      });
      const response = await request(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(options.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          `[Bunway SMS] Twilio rejected the message (${response.status}): ${body.message ?? "Unknown provider error"}`,
        );
      if (!body.sid)
        throw new Error("[Bunway SMS] Twilio returned no message SID.");
      return { id: body.sid, status: "sent", provider: "twilio" };
    },
  };
}

export function mailDriverFromEnv(
  environment: Record<string, string | undefined> = Bun.env,
): MailDriver {
  const configured = environment.MAIL_DRIVER?.trim().toLowerCase() || undefined;
  const driver =
    configured ??
    (environment.NODE_ENV === "production" ? "unconfigured" : "console");
  if (driver === "console") return consoleMailDriver(environment.NODE_ENV);
  if (driver === "resend")
    return resendMailDriver({
      apiKey: environment.RESEND_API_KEY ?? "",
      defaultFrom: environment.MAIL_FROM,
    });
  if (driver === "smtp")
    return smtpMailDriver({
      host: environment.SMTP_HOST ?? "",
      port: environment.SMTP_PORT ? Number(environment.SMTP_PORT) : undefined,
      username: environment.SMTP_USER,
      password: environment.SMTP_PASSWORD,
      secure: environment.SMTP_SECURE === "true",
      defaultFrom: environment.MAIL_FROM,
    });
  if (driver === "unconfigured")
    return {
      name: "unconfigured",
      async send() {
        throw new Error(
          "[Bunway Mail] No production mail provider is configured. Set MAIL_DRIVER=resend or MAIL_DRIVER=smtp.",
        );
      },
    };
  throw new Error(
    `[Bunway Mail] Unknown MAIL_DRIVER "${configured}". Use console, resend, or smtp.`,
  );
}

export function smsDriverFromEnv(
  environment: Record<string, string | undefined> = Bun.env,
): SmsDriver {
  const configured = environment.SMS_DRIVER?.trim().toLowerCase() || undefined;
  const driver =
    configured ??
    (environment.NODE_ENV === "production" ? "unconfigured" : "console");
  if (driver === "console") return consoleSmsDriver(environment.NODE_ENV);
  if (driver === "twilio")
    return twilioSmsDriver({
      accountSid: environment.TWILIO_ACCOUNT_SID ?? "",
      authToken: environment.TWILIO_AUTH_TOKEN ?? "",
      defaultFrom: environment.TWILIO_FROM,
    });
  if (driver === "unconfigured")
    return {
      name: "unconfigured",
      async send() {
        throw new Error(
          "[Bunway SMS] No production SMS provider is configured. Set SMS_DRIVER=twilio.",
        );
      },
    };
  throw new Error(
    `[Bunway SMS] Unknown SMS_DRIVER "${configured}". Use console or twilio.`,
  );
}

export function createMail(options: {
  driver: MailDriver;
  audit?: AuditRecorder;
  enqueue?: (
    payload: MailQueuePayload,
    options?: JobOptions,
  ) => Promise<bigint>;
}) {
  const send = async (message: MailMessage, context: DeliveryContext = {}) => {
    let result: DeliveryResult;
    try {
      result = await options.driver.send(message);
    } catch (error) {
      if (context.auditFailure !== false)
        await options.audit?.("mail.failed", {
          actor: context.audit?.actor ?? { type: "system" },
          subject: context.audit?.subject,
          metadata: {
            to: recipients(message.to),
            subject: message.subject,
            provider: options.driver.name,
            error: safeError(error),
          },
        });
      throw error;
    }
    await options.audit?.(
      `mail.${result.status === "logged" ? "logged" : "sent"}`,
      {
        actor: context.audit?.actor ?? { type: "system" },
        subject: context.audit?.subject,
        metadata: {
          to: recipients(message.to),
          subject: message.subject,
          provider: result.provider,
          providerMessageId: result.id,
        },
      },
    );
    return result;
  };
  return {
    send,
    async sendLater(message: MailMessage, later: SendLaterOptions = {}) {
      if (!options.enqueue)
        throw new Error(
          "[Bunway Mail] sendLater requires Bunway Jobs configuration.",
        );
      const { audit, ...jobOptions } = later;
      return options.enqueue(
        { message: await serializableMail(message), audit },
        jobOptions,
      );
    },
  };
}

export function createSms(options: {
  driver: SmsDriver;
  audit?: AuditRecorder;
  enqueue?: (payload: SmsQueuePayload, options?: JobOptions) => Promise<bigint>;
}) {
  const send = async (message: SmsMessage, context: DeliveryContext = {}) => {
    let result: DeliveryResult;
    try {
      result = await options.driver.send(message);
    } catch (error) {
      if (context.auditFailure !== false)
        await options.audit?.("sms.failed", {
          actor: context.audit?.actor ?? { type: "system" },
          subject: context.audit?.subject,
          metadata: {
            to: message.to,
            provider: options.driver.name,
            error: safeError(error),
          },
        });
      throw error;
    }
    await options.audit?.(
      `sms.${result.status === "logged" ? "logged" : "sent"}`,
      {
        actor: context.audit?.actor ?? { type: "system" },
        subject: context.audit?.subject,
        metadata: {
          to: message.to,
          provider: result.provider,
          providerMessageId: result.id,
        },
      },
    );
    return result;
  };
  return {
    send,
    async sendLater(message: SmsMessage, later: SendLaterOptions = {}) {
      if (!options.enqueue)
        throw new Error(
          "[Bunway SMS] sendLater requires Bunway Jobs configuration.",
        );
      const { audit, ...jobOptions } = later;
      return options.enqueue({ message, audit }, jobOptions);
    },
  };
}

type Builder = (...args: any[]) => MailMessage;
export function createMailer<
  Delivery extends {
    send: (...args: any[]) => any;
    sendLater: (...args: any[]) => any;
  },
>(delivery: Delivery) {
  return function define<Definitions extends Record<string, Builder>>(
    definitions: Definitions,
  ) {
    return Object.fromEntries(
      Object.entries(definitions).map(([name, build]) => [
        name,
        (...args: unknown[]) => {
          const message = build(...args);
          return {
            send: () => delivery.send(message),
            sendLater: (options?: SendLaterOptions) =>
              delivery.sendLater(message, options),
          };
        },
      ]),
    ) as unknown as {
      [Key in keyof Definitions]: (...args: Parameters<Definitions[Key]>) => {
        send(): ReturnType<Delivery["send"]>;
        sendLater(
          options?: SendLaterOptions,
        ): ReturnType<Delivery["sendLater"]>;
      };
    };
  };
}

type SmsBuilder = (...args: any[]) => SmsMessage;
export function defineSms<
  Delivery extends {
    send: (...args: any[]) => any;
    sendLater: (...args: any[]) => any;
  },
  Definitions extends Record<string, SmsBuilder>,
>(delivery: Delivery, definitions: Definitions) {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, build]) => [
      name,
      (...args: unknown[]) => {
        const message = build(...args);
        return {
          send: () => delivery.send(message),
          sendLater: (options?: SendLaterOptions) =>
            delivery.sendLater(message, options),
        };
      },
    ]),
  ) as unknown as {
    [Key in keyof Definitions]: (...args: Parameters<Definitions[Key]>) => {
      send(): ReturnType<Delivery["send"]>;
      sendLater(options?: SendLaterOptions): ReturnType<Delivery["sendLater"]>;
    };
  };
}
