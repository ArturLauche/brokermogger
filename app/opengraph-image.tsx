import { ImageResponse } from "next/og";

export const alt = "Brokermogger — prepare, approve and track privacy requests";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: "#f4f1ea",
        color: "#1c1917",
        padding: "72px",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div style={{ fontSize: 28, letterSpacing: 1, color: "#57534e" }}>
        Open source privacy request desk
      </div>
      <div style={{ fontSize: 64, fontWeight: 650, marginTop: 18, lineHeight: 1.1 }}>
        Brokermogger
      </div>
      <div style={{ fontSize: 32, marginTop: 24, maxWidth: 900, color: "#44403c" }}>
        Prepare, approve and track your own privacy requests. Nothing is sent without your
        approval.
      </div>
    </div>,
    size
  );
}
