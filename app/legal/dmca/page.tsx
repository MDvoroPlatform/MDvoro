import { getDmcaContact } from '@/lib/config/legal';

export default function DmcaPage() {
  const contact = getDmcaContact();
  return (
    <>
      <div className="eyebrow">Copyright operations</div>
      <h1>DMCA designated agent</h1>
      <p className="subtitle">MDvoro maintains this page as the public copyright-contact location. Real operator contact details must be configured before relying on a DMCA safe-harbor process.</p>
      {contact.configured ? (
        <div className="legal-list">
          <p><strong>Designated agent:</strong> {contact.name}</p>
          {contact.organization && <p><strong>Organization:</strong> {contact.organization}</p>}
          <p><strong>Email:</strong> <a href={`mailto:${contact.email}`}>{contact.email}</a></p>
          <p><strong>Phone:</strong> {contact.phone}</p>
          <p><strong>Mailing address:</strong> {contact.address}</p>
        </div>
      ) : (
        <div className="security-note"><strong>Not configured yet.</strong> The deployment owner must set truthful designated-agent details before publishing a DMCA-safe-harbor claim.</div>
      )}
      <h2>Notice process</h2>
      <p>Copyright notices should identify the copyrighted work, identify the allegedly infringing material and its location, provide the required contact information and statements, and include a valid signature. Use the public copyright-notice form on this site.</p>
      <p>For U.S. safe-harbor use, the service provider must also register its designated agent with the U.S. Copyright Office and keep the public and registration information current.</p>
      <p className="legal-disclaimer">This page is an operational template and is not legal advice. Complete the designation and final policy review for the jurisdictions in which MDvoro operates.</p>
    </>
  );
}
