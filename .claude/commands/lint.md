# /lint - Run Linting

Run ESLint to check for code quality issues.

## Steps

1. Run `pnpm lint` to check for issues
2. If there are errors:
   - Display them grouped by file
   - Ask if user wants auto-fix
3. If user wants fix, run `pnpm lint:fix`
4. Also offer to run `pnpm format` for Prettier formatting

## Common Issues

- Unused variables
- Missing dependencies in useEffect
- Import order
