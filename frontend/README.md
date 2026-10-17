This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## ConsultPrep integration status

The `/intake` page calls a server-only Next.js route at `/api/demo/intake`, which runs the local Qwen model from `packages/ai` and returns intake turns and a source-linked draft brief. This is a synthetic development demo: state stays in browser memory, there is no authentication or database persistence, nothing is submitted to a clinician, and no AMD request is made. Do not enter real patient information.

The production Supabase session API is still not implemented. See the [AI frontend/backend integration guide](../packages/ai/docs/frontend-backend-integration.md) for the current demo boundary and remaining production work.

## Getting Started

First, run the development server:

```bash
npm ci
npm run dev
```

The `predev` and `prebuild` scripts compile `packages/ai`. The first AI answer can take longer while the local model loads and is cached.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

Run `npm run typecheck`, `npm run lint`, `npm run test:run`, and `npm run build` from this directory to check the frontend and its AI route.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
