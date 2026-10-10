// npm run verify:aws — real STS GetCallerIdentity. Prints AWS_IDENTITY_OK or the fix.
import { execFileSync } from "node:child_process";
import { checkIdentity, classifyBedrockError, type Identity } from "../lib/aws/clients";
import { isMain, line, loadEnv, run, type Check } from "./_shared";

export function cliVersion(cmd: string): Check {
  try {
    return { state: "PASS", detail: execFileSync(cmd, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0] };
  } catch {
    return { state: "FAIL", detail: `\`${cmd}\` not found on PATH` };
  }
}

export async function verifyAws(): Promise<Check & { identity?: Identity }> {
  try {
    const identity = await checkIdentity();
    return {
      state: "PASS",
      identity,
      detail: `account ${identity.accountMasked}, ${identity.arnType}, ${identity.region}` + (identity.isRoot ? " — WARNING: root user; use an IAM role or user for anything beyond this hackathon" : ""),
    };
  } catch (err) {
    const c = classifyBedrockError(err);
    return { state: "FAIL", detail: `${c.code}: ${c.fix}` };
  }
}

if (isMain("verify-aws.ts"))
  run(async () => {
    loadEnv();
    const cli = cliVersion("aws");
    line("AWS CLI", cli.state === "PASS" ? cli : { state: "NOT_CONFIGURED", detail: "aws CLI not installed (optional: the SDK is what the app uses)" });
    const r = await verifyAws();
    line("AWS identity", r);
    if (r.identity) {
      console.log("AWS_IDENTITY_OK");
      console.log(`ACCOUNT=${r.identity.accountMasked}`);
      console.log(`ARN_TYPE=${r.identity.arnType}`);
      console.log(`REGION=${r.identity.region}`);
      if (r.identity.isRoot) console.log("WARNING: this is the account ROOT user. Avoid routine work as root; create an IAM role or user.");
    }
    return r.state === "PASS" ? 0 : 1;
  });
