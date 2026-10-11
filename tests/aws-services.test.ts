// Unit tests for AWS integrations: Amazon SNS alerts, S3 evidence handling, and CloudWatch EMF telemetry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlert } from "@/lib/alerts";
import { sniffImageType } from "@/lib/aws/clients";
import { storeEvidenceImage } from "@/lib/aws/s3";
import { sendSnsAlert } from "@/lib/aws/sns";
import { emitCloudWatchMetrics } from "@/lib/aws/telemetry";

describe("AWS Services Integration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("S3 Evidence Pipeline", () => {
    it("returns undefined if AWS_S3_EVIDENCE_BUCKET is not set", async () => {
      delete process.env.AWS_S3_EVIDENCE_BUCKET;
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const res = await storeEvidenceImage({
        bytes: pngBytes,
        contentType: "image/png",
        incidentId: "INC-TEST-1",
      });
      expect(res).toBeUndefined();
    });

    it("rejects mismatched image magic bytes", async () => {
      process.env.AWS_S3_EVIDENCE_BUCKET = "test-aquapulse-bucket";
      const fakeBytes = new Uint8Array([1, 2, 3, 4]);
      await expect(
        storeEvidenceImage({
          bytes: fakeBytes,
          contentType: "image/png",
          incidentId: "INC-TEST-1",
        }),
      ).rejects.toThrow("Invalid image format or content-type mismatch");
    });

    it("correctly sniffs valid image magic headers", () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      expect(sniffImageType(jpeg)).toBe("image/jpeg");

      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(sniffImageType(png)).toBe("image/png");

      const invalid = new Uint8Array([0x00, 0x00, 0x00]);
      expect(sniffImageType(invalid)).toBeNull();
    });
  });

  describe("CloudWatch EMF Telemetry", () => {
    it("formats standard CloudWatch Embedded Metric Format JSON", () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
        logs.push(msg);
      });

      emitCloudWatchMetrics({
        namespace: "AquaPulse/Test",
        dimensions: { City: "Bengaluru", Hazard: "Flood" },
        metrics: [
          { name: "ExposedPopulation", value: 1250, unit: "Count" },
          { name: "SeverityScore", value: 85, unit: "Percent" },
        ],
        properties: { scenario: "flood_critical" },
      });

      expect(spy).toHaveBeenCalled();
      expect(logs.length).toBe(1);

      const parsed = JSON.parse(logs[0]);
      expect(parsed._aws).toBeDefined();
      expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe("AquaPulse/Test");
      expect(parsed._aws.CloudWatchMetrics[0].Dimensions[0]).toEqual(["City", "Hazard"]);
      expect(parsed.ExposedPopulation).toBe(1250);
      expect(parsed.SeverityScore).toBe(85);
      expect(parsed.scenario).toBe("flood_critical");
    });
  });

  describe("Amazon SNS Alert Dispatcher", () => {
    it("reports failure when neither topic ARN nor phone number is provided", async () => {
      delete process.env.AWS_SNS_TOPIC_ARN;
      const res = await sendSnsAlert({
        incidentId: "INC-FAIL-1",
        body: "Test flood warning",
      });
      expect(res.status).toBe("failed");
      expect(res.detail).toContain("No SNS Target");
    });

    it("routes through sendAlert with preferTransport='sns'", async () => {
      // Mock SNS publish client call
      const res = await sendAlert({
        incidentId: "INC-SNS-1",
        audience: "emergency_responders",
        body: "High flood surge detected at Bellandur lake outfall.",
        preferTransport: "sns",
        idempotencyKey: "test-sns-key-1",
      });

      expect(res.transport).toBe("sns");
      expect(res.alertId).toBeDefined();
    });

    it("enforces idempotency on duplicate alert requests", async () => {
      const key = "test-idempotency-" + Date.now();
      const first = await sendAlert({
        incidentId: "INC-IDEM-1",
        audience: "crews",
        body: "Deploy high-volume pump P-102.",
        idempotencyKey: key,
      });

      const second = await sendAlert({
        incidentId: "INC-IDEM-1",
        audience: "crews",
        body: "Deploy high-volume pump P-102.",
        idempotencyKey: key,
      });

      expect(second.alertId).toBe(first.alertId);
      expect(second.detail).toContain("Duplicate request");
    });
  });
});
