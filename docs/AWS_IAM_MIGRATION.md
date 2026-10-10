# Moving deployment off the AWS root user

**Today:** the only identity on this account is the root user (`aws login`). It was used for read-only checks, Rekognition test calls, and the CloudFormation deploy of the `aquapulse-ai` stack. The public runtime path does **not** use root: the Lambda runs as its own role with `rekognition:DetectLabels` and its own log writes only.

Nothing below has been created. It changes IAM, so it needs your approval and is not required for the demo.

## Target
A role `aquapulse-deployer`, assumed by a named IAM user with MFA. Root is then used for nothing.

## Least-privilege policy for the deployer (region ap-south-1)

| Purpose | Actions | Resource |
| --- | --- | --- |
| Stack lifecycle | `cloudformation:CreateChangeSet`, `DescribeChangeSet`, `ExecuteChangeSet`, `DeleteChangeSet`, `DescribeStacks`, `DescribeStackEvents`, `DescribeStackResource`, `DescribeStackResources`, `GetTemplate`, `DeleteStack` | `arn:aws:cloudformation:ap-south-1:<account>:stack/aquapulse-ai/*` |
| Function | `lambda:CreateFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration`, `GetFunction`, `GetFunctionConfiguration`, `DeleteFunction`, `AddPermission`, `RemovePermission`, `CreateFunctionUrlConfig`, `UpdateFunctionUrlConfig`, `GetFunctionUrlConfig`, `DeleteFunctionUrlConfig`, `TagResource` | `arn:aws:lambda:ap-south-1:<account>:function:aquapulse-ai-fn` |
| Execution role | `iam:CreateRole`, `GetRole`, `DeleteRole`, `PutRolePolicy`, `GetRolePolicy`, `DeleteRolePolicy`, `TagRole`; `iam:PassRole` only with `iam:PassedToService = lambda.amazonaws.com` | `arn:aws:iam::<account>:role/aquapulse-ai-*` |
| Logs | `logs:CreateLogGroup`, `PutRetentionPolicy`, `DescribeLogGroups`, `DeleteLogGroup`, `FilterLogEvents`, `TagResource` | `arn:aws:logs:ap-south-1:<account>:log-group:/aws/lambda/aquapulse-ai-fn*` |
| Verification | `sts:GetCallerIdentity`, `rekognition:DetectLabels`, `bedrock:ListFoundationModels`, `bedrock:ListInferenceProfiles`, `bedrock:GetFoundationModelAvailability` | `*` (no resource scoping exists for these) |

No `AdministratorAccess`, `IAMFullAccess`, `AmazonBedrockFullAccess` or S3 permissions are needed. Add a permissions boundary on `aquapulse-ai-*` roles if the account will host anything else.

## Steps (console, as root, once)
1. IAM → Users → create your own user and enable MFA.
2. IAM → Roles → create `aquapulse-deployer` trusted by that user, with the policy above.
3. Add a CLI profile that assumes the role; `aws sts get-caller-identity --profile aquapulse` should show the role.
4. `AWS_PROFILE=aquapulse npm run verify:aws`, then a `PREVIEW=1` deploy, to confirm the policy is sufficient.
5. Enable MFA on root, delete any root access keys, and stop signing the CLI in as root.
