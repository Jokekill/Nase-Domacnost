import { redirect } from "next/navigation";

// The cookbook is the main entrance (docs/DESIGN.md, zadání §9.2).
export default function Home() {
  redirect("/kucharka");
}
