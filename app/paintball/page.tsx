import type { Metadata } from "next";
import { Splat } from "./splat";
import "./splat.css";

export const metadata: Metadata = {
  title: "Splat 3D | JMA3A",
  description: "Team up with friends in a neon medina. Live 3D paintball for up to eight players.",
};

export default function PaintballPage() {
  return <Splat />;
}
