import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Authed } from "../../components/Authed";
import { GroupPage } from "../../../web/src/GroupPage";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sampleCensus = readFileSync(join(process.cwd(), "examples/northwind-census.csv"), "utf8");
  return (
    <Authed>
      <GroupPage groupId={id} sampleCensus={sampleCensus} />
    </Authed>
  );
}
