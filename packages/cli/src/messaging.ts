import { extname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { format } from "prettier";
import { camel, CliError, humanize, insertBefore, kebab } from "./utils";
import { generateAudit } from "./audit";

async function write(path: string, source: string) {
  if (await Bun.file(path).exists())
    throw new CliError(`${path} already exists`);
  await mkdir(join(path, ".."), { recursive: true });
  const content =
    extname(path) === ".ts"
      ? await format(source, {
          parser: "typescript",
          printWidth: 100,
          semi: false,
          singleQuote: true,
        })
      : source;
  await Bun.write(path, content);
  console.log(`create ${path}`);
}

function names(raw: string) {
  if (!raw) throw new CliError("A messaging definition name is required");
  const name = camel(raw);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(name))
    throw new CliError(
      "Messaging definition names must contain letters and numbers",
    );
  return {
    name,
    file: kebab(raw),
    type: `${name[0]!.toUpperCase()}${name.slice(1)}Message`,
  };
}

function actions(values: string[]) {
  const selected = values.length ? values : ["notification"];
  for (const action of selected)
    if (!/^[a-z][a-zA-Z0-9_-]*$/i.test(action))
      throw new CliError(`Invalid messaging action "${action}"`);
  return selected.map(camel);
}

async function ensureEnvironment(cwd: string) {
  const path = join(cwd, ".env.example");
  const source = await Bun.file(path).text();
  if (source.includes("MAIL_DRIVER=")) return;
  await Bun.write(
    path,
    `${source.trimEnd()}\n\n# Transactional messaging (console is inferred outside production)\nMAIL_DRIVER=\nMAIL_FROM=\nRESEND_API_KEY=\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASSWORD=\nSMTP_SECURE=false\n\nSMS_DRIVER=\nTWILIO_ACCOUNT_SID=\nTWILIO_AUTH_TOKEN=\nTWILIO_FROM=\n`,
  );
}

export async function ensureMessaging(cwd: string) {
  const path = join(cwd, "src/messaging/index.ts");
  if (await Bun.file(path).exists()) return;
  if (!(await Bun.file(join(cwd, "src/audit/index.ts")).exists()))
    await generateAudit({}, cwd);
  const auditExists = await Bun.file(join(cwd, "src/audit/index.ts")).exists();
  const auditImport = auditExists ? `import { audit } from '../audit'` : "";
  const auditOption = auditExists
    ? `audit: (event, options) => audit.record(event, options),`
    : "";
  await write(
    path,
    `import {
  createMail,
  createMailer,
  createSms,
  defineSms,
  job,
  mailDriverFromEnv,
  smsDriverFromEnv,
  type MailMessage,
  type SmsMessage,
} from '@bunway/core'
${auditImport}

type MailPayload = { message: MailMessage; audit?: { actor?: { type: string; id?: string | number | bigint }; subject?: { type: string; id?: string | number | bigint } } }
type SmsPayload = { message: SmsMessage; audit?: MailPayload['audit'] }

export const mailDeliveryJob = job('bunway-mail-delivery', async (payload: MailPayload, context) => {
  await context.progress(25, 'Sending email')
  await mail.send(payload.message, {
    audit: payload.audit,
    auditFailure: context.attempt >= context.maxAttempts,
  })
  await context.progress(100, 'Email delivered')
})

export const smsDeliveryJob = job('bunway-sms-delivery', async (payload: SmsPayload, context) => {
  await context.progress(25, 'Sending SMS')
  await sms.send(payload.message, {
    audit: payload.audit,
    auditFailure: context.attempt >= context.maxAttempts,
  })
  await context.progress(100, 'SMS delivered')
})

export const mail = createMail({
  driver: mailDriverFromEnv(),
  ${auditOption}
  enqueue: (payload, options) => mailDeliveryJob.performLater(payload, options),
})

const smsDelivery = createSms({
  driver: smsDriverFromEnv(),
  ${auditOption}
  enqueue: (payload, options) => smsDeliveryJob.performLater(payload, options),
})

export const mailer = createMailer(mail)
export const sms = Object.assign(smsDelivery, {
  define<Definitions extends Record<string, (...args: any[]) => SmsMessage>>(definitions: Definitions) {
    return defineSms(smsDelivery, definitions)
  },
})
`,
  );
  await insertBefore(
    join(cwd, "src/jobs/index.ts"),
    "// bunway:jobs",
    `export { mailDeliveryJob, smsDeliveryJob } from '../messaging'`,
  );
  await ensureEnvironment(cwd);
}

export async function generateMailer(
  raw: string,
  rawActions: string[] = [],
  cwd = process.cwd(),
) {
  await ensureMessaging(cwd);
  const value = names(raw);
  const selected = actions(rawActions);
  const definitions = selected
    .map(
      (action) => `  ${action}: ({ to, reference }: ${value.type}) => ({
    to,
    subject: '${humanize(action)} for ${humanize(value.name)} ' + reference,
    text: '${humanize(action)} for ${humanize(value.name)} ' + reference,
  }),`,
    )
    .join("\n");
  await write(
    join(cwd, `src/mailers/${value.file}.ts`),
    `import { mailer } from '../messaging'

export type ${value.type} = { to: string; reference: string }

export const ${value.name}Mailer = mailer({
${definitions}
})
`,
  );
}

export async function generateSms(
  raw: string,
  rawActions: string[] = [],
  cwd = process.cwd(),
) {
  await ensureMessaging(cwd);
  const value = names(raw);
  const selected = actions(rawActions);
  const definitions = selected
    .map(
      (action) => `  ${action}: ({ to, reference }: ${value.type}) => ({
    to,
    text: '${humanize(action)} for ${humanize(value.name)} ' + reference,
  }),`,
    )
    .join("\n");
  await write(
    join(cwd, `src/sms/${value.file}.ts`),
    `import { sms } from '../messaging'

export type ${value.type} = { to: string; reference: string }

export const ${value.name}Sms = sms.define({
${definitions}
})
`,
  );
}
