#!/usr/bin/env node
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function findFiles(dir, extension) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== ".git") {
        const subFiles = await findFiles(fullPath, extension);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function calculateHash(dir, extension) {
  const files = await findFiles(dir, extension);
  files.sort();

  const combinedHash = crypto.createHash("sha256");
  for (const file of files) {
    const fileHash = await hashFile(file);
    combinedHash.update(fileHash);
  }

  return combinedHash.digest("hex");
}

async function main() {
  const srcHash = await calculateHash("src", ".ts");
  const promptsHash = await calculateHash("src/prompts", ".md");

  const metadata = {
    lastBuildTime: new Date().toISOString(),
    sourceHash: srcHash,
    promptsHash: promptsHash,
    version: "1.0.0",
    buildSuccess: true,
    distExists: true,
  };

  await fs.mkdir(".wreckit", { recursive: true });
  await fs.writeFile(".wreckit/build-metadata.json", JSON.stringify(metadata, null, 2));

  console.log("Build metadata created successfully");
  console.log("Source hash:", srcHash);
  console.log("Prompts hash:", promptsHash);
}

main().catch(console.error);
