import { describe, expect, mock, test } from "bun:test";
import {
  consoleMailDriver,
  consoleSmsDriver,
  createMail,
  createSms,
  mailDriverFromEnv,
  resendMailDriver,
  smtpMailDriver,
  smsDriverFromEnv,
  twilioSmsDriver,
} from "../packages/core/src/messaging";

describe("messaging", () => {
  test("console drivers normalize logged delivery and audit no message bodies", async () => {
    const events: Array<{ event: string; options: any }> = [];
    const audit = async (event: string, options: any) =>
      events.push({ event, options });
    const original = console.log;
    console.log = () => {};
    try {
      const mail = createMail({
        driver: consoleMailDriver("development"),
        audit,
      });
      const sms = createSms({ driver: consoleSmsDriver("development"), audit });
      expect(
        (
          await mail.send({
            to: "demo@bunway.test",
            subject: "Secret link",
            text: "token=secret",
          })
        ).status,
      ).toBe("logged");
      expect(
        (await sms.send({ to: "+15555550100", text: "OTP 123456" })).status,
      ).toBe("logged");
    } finally {
      console.log = original;
    }
    expect(events.map((item) => item.event)).toEqual([
      "mail.logged",
      "sms.logged",
    ]);
    expect(JSON.stringify(events)).not.toContain("token=secret");
    expect(JSON.stringify(events)).not.toContain("123456");
  });

  test("production never falls back to console delivery", async () => {
    const mail = createMail({
      driver: mailDriverFromEnv({ NODE_ENV: "production" }),
    });
    const sms = createSms({
      driver: smsDriverFromEnv({ NODE_ENV: "production" }),
    });
    expect(
      mail.send({ to: "a@example.com", subject: "No provider", text: "x" }),
    ).rejects.toThrow("No production mail provider");
    expect(sms.send({ to: "+15555550100", text: "x" })).rejects.toThrow(
      "No production SMS provider",
    );
    expect(() =>
      mailDriverFromEnv({ NODE_ENV: "production", MAIL_DRIVER: "console" }),
    ).not.toThrow();
    expect(
      createMail({
        driver: mailDriverFromEnv({
          NODE_ENV: "production",
          MAIL_DRIVER: "console",
        }),
      }).send({ to: "a@example.com", subject: "x", text: "x" }),
    ).rejects.toThrow("unavailable in production");
    expect(() =>
      mailDriverFromEnv({ NODE_ENV: "production", MAIL_DRIVER: "resend" }),
    ).toThrow("RESEND_API_KEY");
    expect(() =>
      smsDriverFromEnv({ NODE_ENV: "production", SMS_DRIVER: "twilio" }),
    ).toThrow("TWILIO_ACCOUNT_SID");
    expect(
      mailDriverFromEnv({ NODE_ENV: "development", MAIL_DRIVER: "" }).name,
    ).toBe("console");
  });

  test("Resend uses JSON over fetch and returns a normalized result", async () => {
    const fetch = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body));
        expect(payload.to).toEqual(["one@example.com", "two@example.com"]);
        expect(payload.reply_to).toBe("reply@example.com");
        return Response.json({ id: "resend-1" });
      },
    ) as unknown as typeof globalThis.fetch;
    const driver = resendMailDriver({
      apiKey: "test-key",
      defaultFrom: "from@example.com",
      fetch,
    });
    expect(
      await driver.send({
        to: ["one@example.com", "two@example.com"],
        replyTo: "reply@example.com",
        subject: "Hello",
        text: "World",
      }),
    ).toEqual({ id: "resend-1", status: "sent", provider: "resend" });
  });

  test("Twilio uses form encoding and returns a normalized result", async () => {
    const fetch = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(String(init?.body)).toContain("Body=Hello");
        expect(new Headers(init?.headers).get("authorization")).toStartWith(
          "Basic ",
        );
        return Response.json({ sid: "SM123" });
      },
    ) as unknown as typeof globalThis.fetch;
    const driver = twilioSmsDriver({
      accountSid: "AC123",
      authToken: "secret",
      defaultFrom: "+15555550101",
      fetch,
    });
    expect(await driver.send({ to: "+15555550100", text: "Hello" })).toEqual({
      id: "SM123",
      status: "sent",
      provider: "twilio",
    });
  });

  test("SMTP uses the mature transport and normalizes its message ID", async () => {
    let sent: any;
    const driver = smtpMailDriver({
      host: "smtp.example.com",
      defaultFrom: "from@example.com",
      transport: {
        async sendMail(message: any) {
          sent = message;
          return { messageId: "<smtp-1@example.com>" } as any;
        },
      },
    });
    expect(
      await driver.send({
        to: "to@example.com",
        subject: "SMTP",
        text: "Hello",
      }),
    ).toEqual({
      id: "<smtp-1@example.com>",
      status: "sent",
      provider: "smtp",
    });
    expect(sent.from).toBe("from@example.com");
  });

  test("provider failures are normalized into safe Audit outcomes", async () => {
    const events: any[] = [];
    const mail = createMail({
      driver: {
        name: "broken",
        async send() {
          throw new Error("provider unavailable");
        },
      },
      audit: async (event, options) => events.push({ event, options }),
    });
    await expect(
      mail.send({
        to: "a@example.com",
        subject: "Failure",
        text: "secret body",
      }),
    ).rejects.toThrow("provider unavailable");
    expect(events[0].event).toBe("mail.failed");
    expect(JSON.stringify(events[0])).not.toContain("secret body");
  });

  test("queued retries suppress temporary failures and audit the final failure once", async () => {
    const events: string[] = [];
    const mail = createMail({
      driver: {
        name: "broken",
        async send() {
          throw new Error("temporary provider failure");
        },
      },
      audit: async (event) => events.push(event),
    });
    await expect(
      mail.send(
        { to: "a@example.com", subject: "Retry", text: "x" },
        { auditFailure: false },
      ),
    ).rejects.toThrow();
    expect(events).toEqual([]);
    await expect(
      mail.send(
        { to: "a@example.com", subject: "Retry", text: "x" },
        { auditFailure: true },
      ),
    ).rejects.toThrow();
    expect(events).toEqual(["mail.failed"]);
  });

  test("sendLater delegates serialization and scheduling to Bunway Jobs", async () => {
    let queued: any;
    const mail = createMail({
      driver: consoleMailDriver("development"),
      enqueue: async (payload, options) => {
        queued = { payload, options };
        return 42n;
      },
    });
    const id = await mail.sendLater(
      {
        to: "a@example.com",
        subject: "Attachment",
        text: "x",
        attachments: [{ filename: "hello.txt", data: new Blob(["hello"]) }],
      },
      { queue: "mail", runAt: new Date("2030-01-01") },
    );
    expect(id).toBe(42n);
    expect(queued.options.queue).toBe("mail");
    expect(queued.payload.message.attachments[0].data).toBe("aGVsbG8=");
  });
});
