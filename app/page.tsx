import type { Metadata } from "next";
import WarTable from "./war-table";

export const metadata: Metadata = {
  title: "Heinapel War Table v0.1",
  description: "헤이나펄 리그 2기 30인 전략회의용 디지털 작전판",
};

export default function Home() {
  return <WarTable />;
}
