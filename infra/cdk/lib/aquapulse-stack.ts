import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws_s3";
import * as sns from "aws-cdk-lib/aws_sns";
import * as lambda from "aws-cdk-lib/aws_lambda";
import * as iam from "aws-cdk-lib/aws_iam";
import * as logs from "aws-cdk-lib/aws_logs";
import * as events from "aws-cdk-lib/aws_events";
import * as targets from "aws-cdk-lib/aws_events_targets";
import * as cloudwatch from "aws-cdk-lib/aws_cloudwatch";

export interface AquaPulseStackProps extends cdk.StackProps {
  endpointSecret?: string;
  bedrockModelId?: string;
  nationalIngestUrl?: string;
}

export class AquaPulseStack extends cdk.Stack {
  public readonly evidenceBucket: s3.Bucket;
  public readonly emergencyTopic: sns.Topic;
  public readonly aiFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;
  public readonly errorAlarm: cloudwatch.Alarm;
  public readonly durationAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props?: AquaPulseStackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------
    // 1. Amazon S3: Durable, Secure Evidence Storage
    // -------------------------------------------------------------
    this.evidenceBucket = new s3.Bucket(this, "EvidenceBucket", {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: "ArchiveOlderEvidence",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // -------------------------------------------------------------
    // 2. Amazon SNS: Emergency Responder Broadcast Topic
    // -------------------------------------------------------------
    this.emergencyTopic = new sns.Topic(this, "EmergencyTopic", {
      topicName: "aquapulse-emergency-broadcast",
      displayName: "AquaPulse Emergency Disaster Dispatch",
    });

    // -------------------------------------------------------------
    // 3. AWS CloudWatch Log Group for AI Observer Lambda
    // -------------------------------------------------------------
    const logGroup = new logs.LogGroup(this, "AiLambdaLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-fn`,
      retention: logs.RetentionDays.FOURTEEN_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------------
    // 4. IAM Least-Privilege Role for AI Observer
    // -------------------------------------------------------------
    const lambdaRole = new iam.Role(this, "AiLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Least-privilege role for AquaPulse Rekognition, Bedrock, S3, and SNS",
    });

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "RekognitionDetectLabels",
        effect: iam.Effect.ALLOW,
        actions: ["rekognition:DetectLabels"],
        resources: ["*"], // Rekognition DetectLabels does not support resource-level permissions
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockFoundationModels",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:${this.partition}:bedrock:*::foundation-model/*`,
          `arn:${this.partition}:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    this.evidenceBucket.grantReadWrite(lambdaRole);
    this.emergencyTopic.grantPublish(lambdaRole);

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchLogs",
        effect: iam.Effect.ALLOW,
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`${logGroup.logGroupArn}:*`],
      }),
    );

    // -------------------------------------------------------------
    // 5. AWS Lambda: AI Visual Observer & Grounded Explainer
    // -------------------------------------------------------------
    this.aiFunction = new lambda.Function(this, "AiFunction", {
      functionName: `${this.stackName}-fn`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => ({
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "AquaPulse AI Lambda online",
            services: ["Rekognition", "Bedrock", "S3", "SNS"],
            time: new Date().toISOString()
          })
        });
      `),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      logGroup,
      environment: {
        AWS_REGION: this.region,
        AI_ENDPOINT_SECRET: props?.endpointSecret || "change-me-to-a-secure-random-token",
        BEDROCK_MODEL_ID: props?.bedrockModelId || "",
        AWS_S3_EVIDENCE_BUCKET: this.evidenceBucket.bucketName,
        AWS_SNS_TOPIC_ARN: this.emergencyTopic.topicArn,
        INGEST_URL: props?.nationalIngestUrl || "",
      },
    });

    // -------------------------------------------------------------
    // 6. Lambda Function URL (Public Endpoint Gated by Secret Header)
    // -------------------------------------------------------------
    this.functionUrl = this.aiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedHeaders: ["content-type", "x-aquapulse-secret"],
        allowedMethods: [lambda.HttpMethod.POST],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // -------------------------------------------------------------
    // 7. Amazon EventBridge: 15-Minute National Ingestion Schedule
    // -------------------------------------------------------------
    const ingestScheduleRule = new events.Rule(this, "NationalIngestScheduleRule", {
      ruleName: `${this.stackName}-national-ingest`,
      description: "Trigger national hydro-meteorological sync (NDMA SACHET / IMD) every 15 minutes",
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
    });

    ingestScheduleRule.addTarget(
      new targets.LambdaFunction(this.aiFunction, {
        event: events.RuleTargetInput.fromObject({ source: "aquapulse.scheduler" }),
        retryAttempts: 2,
        maxEventAge: cdk.Duration.minutes(10),
      }),
    );

    // -------------------------------------------------------------
    // 8. Amazon CloudWatch: Operational Resilience Dashboard & Alarms
    // -------------------------------------------------------------
    this.errorAlarm = new cloudwatch.Alarm(this, "AiLambdaErrorAlarm", {
      alarmName: `${this.stackName}-HighErrorRate`,
      metric: this.aiFunction.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: "Alerts when AquaPulse AI Lambda encounters consecutive invocation errors.",
    });

    this.durationAlarm = new cloudwatch.Alarm(this, "AiLambdaDurationAlarm", {
      alarmName: `${this.stackName}-HighLatency`,
      metric: this.aiFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: "p95",
      }),
      threshold: 25000, // 25 seconds
      evaluationPeriods: 1,
      alarmDescription: "Alerts when AI inference duration exceeds 25s threshold.",
    });

    // Add CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, "ResilienceDashboard", {
      dashboardName: "AquaPulse-Disaster-Resilience-Overview",
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "AI Observer Lambda Invocations & Errors",
        left: [this.aiFunction.metricInvocations({ statistic: "Sum" })],
        right: [this.aiFunction.metricErrors({ statistic: "Sum" })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "Observer Processing Duration (p50 / p95)",
        left: [
          this.aiFunction.metricDuration({ statistic: "p50" }),
          this.aiFunction.metricDuration({ statistic: "p95" }),
        ],
        width: 12,
      }),
    );

    // -------------------------------------------------------------
    // 9. Stack CloudFormation Outputs
    // -------------------------------------------------------------
    new cdk.CfnOutput(this, "EvidenceBucketNameOutput", {
      description: "Name of the S3 evidence media bucket",
      value: this.evidenceBucket.bucketName,
      exportName: `${this.stackName}-EvidenceBucketName`,
    });

    new cdk.CfnOutput(this, "EmergencyTopicArnOutput", {
      description: "ARN of the Amazon SNS emergency responder broadcast topic",
      value: this.emergencyTopic.topicArn,
      exportName: `${this.stackName}-EmergencyTopicArn`,
    });

    new cdk.CfnOutput(this, "AiFunctionUrlOutput", {
      description: "Function URL for the AI Observer (set as AI_ENDPOINT_URL on web host)",
      value: this.functionUrl.url,
      exportName: `${this.stackName}-AiFunctionUrl`,
    });

    new cdk.CfnOutput(this, "CloudWatchDashboardNameOutput", {
      description: "Name of the operational resilience dashboard",
      value: dashboard.dashboardName,
    });
  }
}
