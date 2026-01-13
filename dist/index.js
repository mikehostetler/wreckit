#!/usr/bin/env bun

// src/index.ts
import { Command } from "commander";
var program = new Command();
program.name("wreck").description("A CLI tool built with Bun and Commander").version("0.0.1");
program.action(() => {
  console.log("Hello World");
});
program.parse();
