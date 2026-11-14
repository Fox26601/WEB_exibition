import { SignJWT, jwtVerify } from "jose";

function secretKey(): Uint8Array {
  const secret =
    process.env.CATALOG_SIGNING_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-catalog-signing-secret";
  return new TextEncoder().encode(secret);
}

export async function signPreviewToken(
  expiresIn = "2h",
): Promise<string> {
  return new SignJWT({ scope: "catalog-draft" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifyPreviewToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.scope === "catalog-draft";
  } catch {
    return false;
  }
}
