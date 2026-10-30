"use client";

import { useRouter } from "next/navigation";
import { Authed } from "../components/Authed";
import { GroupsHome } from "../../web/src/GroupsHome";

export default function GroupsPage() {
  const router = useRouter();
  return (
    <Authed>
      <GroupsHome go={(path) => router.push(path)} />
    </Authed>
  );
}
