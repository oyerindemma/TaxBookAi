import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TaxBook AI";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #f7f1e4 0%, #f5faf5 48%, #eef4fb 100%)",
          color: "#112418",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            borderRadius: "36px",
            border: "1px solid rgba(17,36,24,0.08)",
            background: "rgba(255,255,255,0.72)",
            padding: "44px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                width: "72px",
                height: "72px",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "24px",
                background: "#397658",
                color: "white",
                fontSize: "30px",
                fontWeight: 700,
              }}
            >
              TB
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "20px", color: "#4d6153", textTransform: "uppercase" }}>
                AI accounting software for Nigerian businesses and accounting firms
              </div>
              <div style={{ fontSize: "44px", fontWeight: 700 }}>TaxBook AI</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "920px" }}>
            <div style={{ fontSize: "66px", lineHeight: 1.05, fontWeight: 700 }}>
              Upload. Review. Reconcile. File with more confidence.
            </div>
            <div style={{ fontSize: "28px", lineHeight: 1.45, color: "#52685a" }}>
              AI receipt scanning, bookkeeping review, bank reconciliation, VAT and WHT summaries,
              multi-business workspaces, and filing-ready tax workflows.
            </div>
          </div>

          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
            {["Nigeria-ready VAT/WHT", "AI-assisted bookkeeping", "Bank reconciliation", "Filing-ready workflows"].map(
              (label) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderRadius: "999px",
                    border: "1px solid rgba(17,36,24,0.12)",
                    padding: "12px 20px",
                    fontSize: "22px",
                    color: "#2e4537",
                    background: "rgba(255,255,255,0.86)",
                  }}
                >
                  {label}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    ),
    size
  );
}
