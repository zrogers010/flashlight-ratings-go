import { getMerchantConfig } from "@/lib/affiliate-links";

export function AmazonDisclosure() {
  const config = getMerchantConfig();
  const hasAwin = !!config.awin;
  const hasAvantlink = !!config.avantlink;
  
  let text = "As an Amazon Associate we earn from qualifying purchases.";
  
  if (hasAwin || hasAvantlink) {
    const programs = [];
    if (hasAwin) programs.push("Awin (Olight)");
    if (hasAvantlink) programs.push("AvantLink (Fenix)");
    text += ` We also earn from ${programs.join(" and ")}.`;
  }
  
  text += " Pricing and availability can change quickly. Always use Check Price buttons for current details.";
  
  return (
    <p className="disclosure">
      {text}
    </p>
  );
}

