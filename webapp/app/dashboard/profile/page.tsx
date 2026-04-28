import { requireUser } from "@/lib/auth";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28, marginBottom: 6, fontWeight: 600, color: "#0f172a" }}>
          Profile
        </h1>
        <p style={{ color: "#475569" }}>Manage your account details and password.</p>
      </div>

      <ProfileClient
        user={{
          fullName: user.fullName,
          email: user.email,
        }}
      />
    </section>
  );
}
