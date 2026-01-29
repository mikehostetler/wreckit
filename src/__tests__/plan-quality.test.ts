import { describe, it, expect } from "bun:test";
import {
  validatePlanQuality,
  type PlanQualityResult,
  type PlanQualityOptions,
} from "../domain/validation";

describe("Plan Quality Validation (Gap 2)", () => {
  describe("validatePlanQuality", () => {
    const defaultOptions: PlanQualityOptions = {
      minPhases: 1,
      requiredSections: [
        "Header",
        "Implementation Plan Title",
        "Overview",
        "Current State",
        "Desired End State",
        "What We're NOT Doing",
        "Implementation Approach",
        "Phases",
        "Testing Strategy",
      ],
    };

    describe("phase count validation", () => {
      it("passes with at least one implementation phase", () => {
        const content = `
# Implementation Plan: Add Feature X

## Implementation Plan Title
Add Feature X to the system

## Overview
This plan outlines the implementation of Feature X.

## Current State
The system currently does not have Feature X.

## Desired End State
Feature X is fully implemented and tested.

## What We're NOT Doing
We are not implementing Feature Y at this time.

## Implementation Approach
We will implement Feature X using TypeScript.

## Phases

### Phase 1: Core Implementation
Implement the core functionality.

## Testing Strategy
We will use unit tests and integration tests.
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.phases).toBe(1);
        expect(result.errors).toEqual([]);
      });

      it("passes with multiple implementation phases", () => {
        const content = `
# Implementation Plan

## Implementation Plan Title
Multi-phase implementation

## Overview
Plan overview

## Current State
Current state description

## Desired End State
End state description

## What We're NOT Doing
Out of scope items

## Implementation Approach
Our approach

## Phases

### Phase 1: Setup
Initial setup and configuration

### Phase 2: Core Features
Implement core functionality

### Phase 3: Testing
Comprehensive testing

## Testing Strategy
Testing approach
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.phases).toBe(3);
      });

      it("fails with no implementation phases", () => {
        const content = `
# Implementation Plan

## Implementation Plan Title
Plan without phases

## Overview
Overview

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
Nothing

## Implementation Approach
Approach

## Phases
No phases defined here.

## Testing Strategy
Testing
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.phases).toBe(0);
        expect(result.errors.some((e) => e.includes("phase"))).toBe(true);
      });

      it("only counts ### headers within the Phases section", () => {
        const content = `
# Implementation Plan

## Implementation Plan Title
Plan with headers outside phases

## Overview
Overview

### This should not count
It's outside the Phases section

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
Nothing

## Implementation Approach
### Should not count
Outside phases

## Phases

### Phase 1: Actual Phase
This one should count

## Testing Strategy
### Should not count
After Testing Strategy
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.phases).toBe(1);
      });

      it("requires at least the minimum number of phases", () => {
        const options: PlanQualityOptions = {
          minPhases: 2,
          requiredSections: defaultOptions.requiredSections,
        };

        const content = `
# Implementation Plan

## Implementation Plan Title
Plan with one phase

## Overview
Overview

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
Nothing

## Implementation Approach
Approach

## Phases

### Phase 1: Only Phase
Just one phase

## Testing Strategy
Testing
`;

        const result = validatePlanQuality(content, options);
        expect(result.valid).toBe(false);
        expect(result.phases).toBe(1);
        expect(result.errors.some((e) => e.includes("at least 2"))).toBe(true);
      });
    });

    describe("required sections validation", () => {
      it("passes with all required sections present", () => {
        const content = `
# Implementation Plan: Feature

## Implementation Plan Title
Complete plan title

## Overview
This is the overview section with sufficient detail.

## Current State
The current state of the system.

## Desired End State
What we want to achieve.

## What We're NOT Doing
Things explicitly out of scope.

## Implementation Approach
Our implementation approach.

## Phases

### Phase 1: First Phase
Implementation details

## Testing Strategy
Our testing approach.
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.missingSections).toEqual([]);
      });

      it("fails with missing required sections", () => {
        const content = `
# Implementation Plan

## Overview
Just an overview, missing everything else.
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.missingSections.length).toBeGreaterThan(0);
        expect(result.missingSections).toContain("Implementation Plan Title");
        expect(result.missingSections).toContain("Current State");
        expect(result.missingSections).toContain("Desired End State");
        expect(result.missingSections).toContain("What We're NOT Doing");
        expect(result.missingSections).toContain("Implementation Approach");
        expect(result.missingSections).toContain("Phases");
        expect(result.missingSections).toContain("Testing Strategy");
      });

      it("allows case-insensitive section matching", () => {
        const content = `
# implementation plan: feature

## implementation plan title
Case insensitive title

## overview
Overview here

## current state
Current state

## desired end state
End state

## what we're not doing
Out of scope

## implementation approach
Approach

## phases

### phase 1: implementation
Details

## testing strategy
Testing
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.missingSections).toEqual([]);
      });

      it("handles alternative section header styles", () => {
        const content = `
# Plan

# Implementation Plan Title
Title using # instead of ##

# Overview
Overview using # instead of ##

# Current State
Current using # instead of ##

# Desired End State
Desired using # instead of ##

# What We're NOT Doing
Scope using # instead of ##

# Implementation Approach
Approach using # instead of ##

# Phases

### Phase 1
Details

# Testing Strategy
Testing using # instead of ##
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.missingSections).toEqual([]);
      });
    });

    describe("real-world examples", () => {
      it("validates a minimal but acceptable plan", () => {
        const content = `# Implementation Plan: Add User Authentication

## Implementation Plan Title
Add secure user authentication with JWT tokens

## Overview
We need to add user authentication to secure API endpoints. Users should be able to register, login, and maintain sessions using JWT tokens.

## Current State
The application currently has no authentication. All endpoints are publicly accessible. User data is stored but without any access control.

## Desired End State
Users can register accounts, log in with email/password, and receive JWT tokens. Protected endpoints require valid tokens. Passwords are securely hashed.

## What We're NOT Doing
- Social login (Google, GitHub, etc.)
- Password reset flow (will be added later)
- Two-factor authentication
- Account email verification

## Implementation Approach
We'll use bcrypt for password hashing and jsonwebtoken for JWT management. Authentication middleware will protect routes.

## Phases

### Phase 1: Database Schema
Add users table with email, password_hash, created_at columns.

### Phase 2: Authentication Service
Create service with register, login, and verifyToken methods.

### Phase 3: API Endpoints
Add POST /auth/register and POST /auth/login endpoints.

### Phase 4: Middleware
Create auth middleware to validate JWT tokens on protected routes.

## Testing Strategy
- Unit tests for password hashing and token generation
- Integration tests for auth endpoints
- Test protected routes with valid/invalid tokens
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.phases).toBe(4);
      });

      it("rejects a superficial plan without phases", () => {
        const content = `# Plan

## Implementation Plan Title
Add feature

## Overview
Add a new feature.

## Current State
Feature doesn't exist.

## Desired End State
Feature exists.

## What We're NOT Doing
Nothing

## Implementation Approach
Write code.

## Phases
No specific phases defined.

## Testing Strategy
Write tests.
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.phases).toBe(0);
      });

      it("rejects a plan missing key sections", () => {
        const content = `# Plan

## Overview
We'll add a feature.

## Phases

### Phase 1: Implement
Do the work

## Testing Strategy
Test it
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.missingSections.length).toBeGreaterThan(0);
      });
    });

    describe("edge cases", () => {
      it("handles empty content gracefully", () => {
        const result = validatePlanQuality("", defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.missingSections.length).toBe(
          defaultOptions.requiredSections.length,
        );
      });

      it("handles content with no sections", () => {
        const result = validatePlanQuality(
          "Just some text with no structure",
          defaultOptions,
        );
        expect(result.valid).toBe(false);
        expect(result.missingSections.length).toBe(
          defaultOptions.requiredSections.length,
        );
      });

      it("allows custom options", () => {
        const customOptions: PlanQualityOptions = {
          minPhases: 2,
          requiredSections: ["Header", "Overview", "Phases"],
        };

        const content = `
# Custom Plan

## Overview
Simple overview

## Phases

### Phase 1: First
First phase

### Phase 2: Second
Second phase
`;

        const result = validatePlanQuality(content, customOptions);
        expect(result.valid).toBe(true);
        expect(result.phases).toBe(2);
      });

      it("handles phases section at the end without Testing Strategy", () => {
        const content = `
# Plan

## Implementation Plan Title
Plan at end

## Overview
Overview

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
Nothing

## Implementation Approach
Approach

## Phases

### Phase 1: Last Phase
This is at the end
`;

        const result = validatePlanQuality(content, defaultOptions);
        // Should still count the phase since extractSectionContent handles missing end section
        expect(result.phases).toBeGreaterThanOrEqual(1);
      });

      it("handles malformed phase headers", () => {
        const content = `
# Plan

## Implementation Plan Title
Malformed phases

## Overview
Overview

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
Nothing

## Implementation Approach
Approach

## Phases

### Phase without title

####
Multiple hashes

## Not a phase
This is ## not ###

### Valid Phase
This is valid

## Testing Strategy
Testing
`;

        const result = validatePlanQuality(content, defaultOptions);
        // Both ### headers count, even if one is empty
        expect(result.phases).toBe(2);
      });
    });

    describe("section extraction behavior", () => {
      it("handles What We're NOT Doing section correctly", () => {
        const content = `
# Plan

## Implementation Plan Title
Test

## Overview
Overview

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
This is the out of scope section

## Implementation Approach
Approach

## Phases

### Phase 1
Details

## Testing Strategy
Testing
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("handles sections with special characters", () => {
        const content = `
# Plan

## Implementation Plan Title
Test's Plan

## Overview
Overview with "quotes" and 'apostrophes'

## Current State
Current

## Desired End State
Desired

## What We're NOT Doing
Things with - dashes and / slashes

## Implementation Approach
Approach

## Phases

### Phase 1: First Step
Details

## Testing Strategy
Testing with (parentheses)
`;

        const result = validatePlanQuality(content, defaultOptions);
        expect(result.valid).toBe(true);
      });
    });
  });
});
