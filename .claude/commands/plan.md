# /plan - Plan Implementation

Create a detailed implementation plan for a feature or task.

## Arguments

$ARGUMENTS - Feature or task description

## Steps

1. Analyze the request against the PRD (specifications.md)
2. Identify affected components:
   - UI components
   - State stores
   - Database tables
   - API endpoints
   - Agents
3. Create step-by-step implementation plan
4. Identify dependencies between steps
5. Estimate complexity (simple/medium/complex)
6. Ask for approval before proceeding

## Output Format

```
## Implementation Plan: {feature}

### Overview
{brief description}

### Steps
1. [ ] Step one...
2. [ ] Step two...

### Files to Create/Modify
- `src/components/...` - {reason}
- `src/store/...` - {reason}

### Dependencies
- Step 2 depends on Step 1
- ...

### Risks/Considerations
- {any risks or edge cases}
```

## Example

`/plan Add lineage locking UI` creates a plan for implementing the lock toggle feature.
