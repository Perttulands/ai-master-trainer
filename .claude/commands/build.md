# /build - Build and Type Check

Run TypeScript compilation and Vite production build.

## Steps

1. Run `pnpm build` which executes:
   - `tsc` - TypeScript type checking
   - `vite build` - Production bundle
2. If there are TypeScript errors:
   - List all errors clearly
   - Offer to fix them one by one
3. Report build success and bundle size

## Output

Build artifacts go to `dist/` directory.
