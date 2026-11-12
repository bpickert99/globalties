// Minimal Deno globals so the edge function type-checks with the project's TypeScript.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void
  env: { get(name: string): string | undefined }
}
