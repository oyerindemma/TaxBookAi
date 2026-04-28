"use client";

import { useState } from "react";

type ProfileClientProps = {
  user: {
    fullName: string;
    email: string;
  };
};

export default function ProfileClient({ user }: ProfileClientProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  async function onUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileLoading(true);
    setProfileErr(null);
    setProfileMsg(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setProfileErr(data?.error ?? "Failed to update profile");
        return;
      }

      setProfileMsg("Profile updated");
      if (data?.user?.fullName) setFullName(data.user.fullName);
      if (data?.user?.email) setEmail(data.user.email);
    } catch {
      setProfileErr("Network error");
    } finally {
      setProfileLoading(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordErr(null);
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordErr("Passwords do not match");
      setPasswordLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordErr(data?.error ?? "Failed to update password");
        return;
      }

      setPasswordMsg("Password updated");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordErr("Network error");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 24, maxWidth: 520 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12, fontWeight: 600, color: "#0f172a" }}>
          Profile details
        </h2>
        <form onSubmit={onUpdateProfile} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
            />
          </label>

          <button disabled={profileLoading} type="submit">
            {profileLoading ? "Saving..." : "Save changes"}
          </button>
        </form>
        {profileErr && <p style={{ marginTop: 12, color: "#b91c1c" }}>{profileErr}</p>}
        {profileMsg && <p style={{ marginTop: 12, color: "#0f766e" }}>{profileMsg}</p>}
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12, fontWeight: 600, color: "#0f172a" }}>
          Change password
        </h2>
        <form onSubmit={onChangePassword} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Current password</span>
            <input
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Current password"
              type="password"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>New password</span>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              type="password"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Confirm new password</span>
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              type="password"
            />
          </label>

          <button disabled={passwordLoading} type="submit">
            {passwordLoading ? "Updating..." : "Update password"}
          </button>
        </form>
        {passwordErr && <p style={{ marginTop: 12, color: "#b91c1c" }}>{passwordErr}</p>}
        {passwordMsg && <p style={{ marginTop: 12, color: "#0f766e" }}>{passwordMsg}</p>}
      </div>
    </section>
  );
}
