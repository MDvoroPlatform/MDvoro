export type DmcaContact = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  address: string;
  configured: boolean;
};

export function getDmcaContact(): DmcaContact {
  const name = process.env.DMCA_AGENT_NAME?.trim() ?? '';
  const organization = process.env.DMCA_AGENT_ORGANIZATION?.trim() ?? '';
  const email = process.env.DMCA_AGENT_EMAIL?.trim() ?? '';
  const phone = process.env.DMCA_AGENT_PHONE?.trim() ?? '';
  const address = process.env.DMCA_AGENT_ADDRESS?.trim() ?? '';
  return { name, organization, email, phone, address, configured: Boolean(name && email && phone && address) };
}
