#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AquaPulseStack } from "../lib/aquapulse-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "ap-south-1",
};

new AquaPulseStack(app, "AquaPulseStack", {
  env,
  description: "AquaPulse: Urban Water Crisis Intelligence & Decision Engine on AWS",
  tags: {
    Project: "AquaPulse",
    Track: "AWS-Hackathon-Smart-Cities-Resilience",
    Environment: process.env.NODE_ENV || "production",
  },
});
