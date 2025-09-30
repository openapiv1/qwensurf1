"use server";

import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import { Sandbox } from "@e2b/desktop";

export async function createSandbox(resolution: [number, number]) {
  try {
    const newSandbox = await Sandbox.create({
      resolution,
      dpi: 96,
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });

    await newSandbox.stream.start();

    return {
      sandboxId: newSandbox.sandboxId,
      vncUrl: newSandbox.stream.getUrl(),
    };
  } catch (error) {
    console.error("Failed to create sandbox:", error);
    return null;
  }
}

export async function increaseTimeout(sandboxId: string) {
  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.setTimeout(SANDBOX_TIMEOUT_MS); // 5 minutes
    return true;
  } catch (error) {
    console.error("Failed to increase timeout:", error);
    return false;
  }
}

export async function stopSandboxAction(sandboxId: string) {
  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.kill();
    return true;
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return false;
  }
}
