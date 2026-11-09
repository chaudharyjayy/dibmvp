import type { Metadata } from "next"
import Demo from "@/components/demo/murmuration-demo"

export const metadata: Metadata = {
  title: "Murmuration preview",
  description: "Isolated preview of the murmuration wordmark component.",
}

export default function MurmurationPreviewPage() {
  return <Demo />
}
