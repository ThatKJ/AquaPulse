// Amazon SNS: Emergency alert dispatcher for urban water crisis response teams.
// Dispatches to an SNS Topic (broadcast to control rooms & responder groups) or directly via SMS.
import { PublishCommand } from "@aws-sdk/client-sns";
import { serverEnv } from "../schemas/env";
import { classifyBedrockError, logOp, snsClient } from "./clients";

export type SnsAlertInput = {
  incidentId: string;
  body: string;
  audience?: string;
  topicArn?: string;
  phoneNumber?: string;
  subject?: string;
};

export type SnsAlertResponse = {
  messageId?: string;
  status: "sent" | "failed";
  detail: string;
};

/**
 * Publishes an emergency water resilience alert to Amazon SNS.
 * When topicArn is not provided, defaults to AWS_SNS_TOPIC_ARN if set.
 */
export async function sendSnsAlert(input: SnsAlertInput): Promise<SnsAlertResponse> {
  const env = serverEnv();
  const targetTopic = input.topicArn ?? env.AWS_SNS_TOPIC_ARN;
  const targetPhone = input.phoneNumber;

  if (!targetTopic && !targetPhone) {
    return {
      status: "failed",
      detail: "No SNS Target: neither AWS_SNS_TOPIC_ARN nor phoneNumber was provided.",
    };
  }

  const start = Date.now();
  const subject = (input.subject ?? `AquaPulse Alert: ${input.incidentId}`).slice(0, 100);
  // SMS/SNS body truncated to 1500 chars to avoid payload overflow
  const message = input.body.slice(0, 1500);

  try {
    const command = new PublishCommand({
      TopicArn: targetTopic,
      PhoneNumber: targetTopic ? undefined : targetPhone,
      Subject: subject,
      Message: message,
      MessageAttributes: {
        IncidentId: {
          DataType: "String",
          StringValue: input.incidentId,
        },
        Audience: {
          DataType: "String",
          StringValue: input.audience ?? "all",
        },
        Source: {
          DataType: "String",
          StringValue: "AquaPulse",
        },
      },
    });

    const res = await snsClient().send(command);
    const messageId = res.MessageId;

    logOp({
      service: "sns",
      op: "Publish",
      requestId: res.$metadata.requestId,
      durationMs: Date.now() - start,
      status: "ok",
      incidentId: input.incidentId,
      messageId,
      hasTopic: Boolean(targetTopic),
    });

    return {
      messageId,
      status: "sent",
      detail: `Amazon SNS accepted message ${messageId} (${targetTopic ? "Topic broadcast" : "Direct SMS"}).`,
    };
  } catch (err) {
    const classified = classifyBedrockError(err);
    logOp({
      service: "sns",
      op: "Publish",
      requestId: (err as { $metadata?: { requestId?: string } })?.$metadata?.requestId,
      durationMs: Date.now() - start,
      status: "error",
      incidentId: input.incidentId,
      code: classified.code,
      errorName: classified.name,
    });

    return {
      status: "failed",
      detail: `Amazon SNS dispatch failed (${classified.code}): ${classified.fix}`,
    };
  }
}
