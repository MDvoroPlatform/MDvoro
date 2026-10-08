import { Icon } from '@/components/ui/icons';
export function EmptyPanel({ title, description, action, href }: {
    title: string;
    description: string;
    action?: string;
    href?: string;
}) {
    return <div className="empty"><div className="empty-icon"><Icon name="target"/></div><h2>{title}</h2><p>{description}</p>{action && href ? <a className="btn btn-primary" href={href}>{action}<Icon name="arrow" size={15}/></a> : null}</div>;
}

