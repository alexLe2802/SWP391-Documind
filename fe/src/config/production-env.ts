const REQUIRED_PRODUCTION_VARIABLES = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

type Environment = Record<string, string | undefined>;

// Kiểm tra điều kiện production environment.
export function validateProductionEnvironment(environment: Environment): void {
  if (environment.NODE_ENV !== "production") return;

  if (environment.NEXT_PUBLIC_USE_MOCK_API === "true") {
    throw new Error("NEXT_PUBLIC_USE_MOCK_API must not be true in production");
  }

  const missing = REQUIRED_PRODUCTION_VARIABLES.filter(
    (name) => !environment[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing production environment variables: ${missing.join(", ")}`,
    );
  }
}
