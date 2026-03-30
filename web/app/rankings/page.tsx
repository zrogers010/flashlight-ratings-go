import { redirect } from "next/navigation";

export default function RankingsRedirect({
  searchParams
}: {
  searchParams?: { use_case?: string };
}) {
  const uc = searchParams?.use_case;
  redirect(uc ? `/compare?use_case=${uc}` : "/compare");
}
