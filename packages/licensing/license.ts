import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { LicenseSchema, type License } from "../shared/contracts.js";

const LICENSE_PATH = join(process.env.HOME || "~", ".wreckit", "license.json");

export function loadLicense(path?: string): License | null {
  const licensePath = path || LICENSE_PATH;

  if (!existsSync(licensePath)) {
    return null;
  }

  try {
    const raw = readFileSync(licensePath, "utf-8");
    const parsed = JSON.parse(raw);
    return LicenseSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function isLicenseValid(license: License | null): boolean {
  if (!license) {
    return false;
  }

  if (!license.licenseKey || license.licenseKey.length === 0) {
    return false;
  }

  return true;
}

export function validateLicense(path?: string): { valid: boolean; license: License | null; error?: string } {
  const license = loadLicense(path);

  if (!license) {
    return {
      valid: false,
      license: null,
      error: "License file not found. Run 'wreckit onboard' to set up.",
    };
  }

  if (!isLicenseValid(license)) {
    return {
      valid: false,
      license,
      error: "Invalid license key.",
    };
  }

  return {
    valid: true,
    license,
  };
}
