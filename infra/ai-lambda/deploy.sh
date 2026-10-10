#!/usr/bin/env bash
# Deploy the AI Lambda with a reviewed CloudFormation change set.
#   PREVIEW=1 AI_ENDPOINT_SECRET=... bash infra/ai-lambda/deploy.sh    create the change set, print it, stop
#   CHANGE_SET=<name> bash infra/ai-lambda/deploy.sh                   execute exactly that previewed change set
#   AI_ENDPOINT_SECRET=... bash infra/ai-lambda/deploy.sh              create, print and execute in one go
# Optional: BEDROCK_MODEL_ID, RESERVED_CONCURRENCY (-1 = none), STACK_NAME, AWS_REGION.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
STACK_NAME="${STACK_NAME:-aquapulse-ai}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"
export AWS_PAGER=""

aws sts get-caller-identity --query Arn --output text >/dev/null || { echo "FAIL: no AWS identity. Run \`aws login\`."; exit 1; }

if [ -z "${CHANGE_SET:-}" ]; then
  : "${AI_ENDPOINT_SECRET:?Set AI_ENDPOINT_SECRET (24+ chars, e.g. openssl rand -hex 24)}"
  # A stack that exists only as an unexecuted CREATE change set is still REVIEW_IN_PROGRESS.
  state="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo NONE)"
  case "$state" in NONE|REVIEW_IN_PROGRESS) type=CREATE ;; *) type=UPDATE ;; esac
  CHANGE_SET="deploy-$(date +%Y%m%d-%H%M%S)"
  aws cloudformation create-change-set \
    --stack-name "$STACK_NAME" --change-set-name "$CHANGE_SET" --change-set-type "$type" \
    --template-body "file://$here/template.yaml" --capabilities CAPABILITY_IAM \
    --parameters \
      "ParameterKey=EndpointSecret,ParameterValue=$AI_ENDPOINT_SECRET" \
      "ParameterKey=BedrockModelId,ParameterValue=${BEDROCK_MODEL_ID:-}" \
      "ParameterKey=ReservedConcurrency,ParameterValue=${RESERVED_CONCURRENCY:-2}" \
    --query Id --output text >/dev/null
  if ! aws cloudformation wait change-set-create-complete --stack-name "$STACK_NAME" --change-set-name "$CHANGE_SET" 2>/dev/null; then
    reason="$(aws cloudformation describe-change-set --stack-name "$STACK_NAME" --change-set-name "$CHANGE_SET" --query StatusReason --output text)"
    case "$reason" in
      *"didn't contain changes"*|*"No updates"*) echo "Infrastructure unchanged."; CHANGE_SET="" ;;
      *) echo "FAIL: change set not created: $reason"; exit 1 ;;
    esac
  fi
  if [ -n "$CHANGE_SET" ]; then
    echo "Change set $CHANGE_SET ($type) on stack $STACK_NAME in $AWS_REGION:"
    aws cloudformation describe-change-set --stack-name "$STACK_NAME" --change-set-name "$CHANGE_SET" \
      --query "Changes[].ResourceChange.[Action,Replacement,ResourceType,LogicalResourceId]" --output table
  fi
  if [ "${PREVIEW:-0}" = "1" ]; then
    [ -n "$CHANGE_SET" ] && echo "PREVIEW only, nothing executed. To apply exactly this: CHANGE_SET=$CHANGE_SET bash infra/ai-lambda/deploy.sh"
    exit 0
  fi
fi

if [ -n "$CHANGE_SET" ]; then
  aws cloudformation execute-change-set --stack-name "$STACK_NAME" --change-set-name "$CHANGE_SET"
  if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].StackStatus" --output text | grep -Eq "CREATE|REVIEW"; then
    aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME"
  else
    aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME"
  fi
fi

bash "$here/build.sh"
fn="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue" --output text)"
url="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='AiEndpointUrl'].OutputValue" --output text)"
aws lambda wait function-updated --function-name "$fn"
aws lambda update-function-code --function-name "$fn" --zip-file "fileb://$here/dist/function.zip" --query CodeSha256 --output text
aws lambda wait function-updated --function-name "$fn"
echo "DEPLOYED. Set on the web host:"
echo "  AI_ENDPOINT_URL=${url%/}"
echo "  AI_ENDPOINT_SECRET=<the secret you passed>"
echo "Smoke test (no inference): curl -s -X POST ${url%/}/health -H \"x-aquapulse-secret: \$AI_ENDPOINT_SECRET\" -d '{}'"
