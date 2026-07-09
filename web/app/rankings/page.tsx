import { redirect } from "next/navigation";

export default async function RankingsRedirect({
  searchParams
}: {
  searchParams?: Promise<{ use_case?: string }>;
}) {
  const uc = (await searchParams)?.use_case;
  redirect(uc ? `/compare?use_case=${uc}` : "/compare");
}
