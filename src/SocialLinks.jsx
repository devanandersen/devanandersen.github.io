import { GROUND_RATIO } from './constants';

const LINKS = [
  { label: 'GITHUB',   href: 'https://github.com/devanandersen' },
  { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/devan-a-68211b73/' },
  { label: 'TWITTER',  href: 'https://x.com/devandersen' },
];

export default function SocialLinks() {
  return (
    <div class="social-links" style={{ top: `${GROUND_RATIO * 100 + 3}%` }}>
      {LINKS.map(({ label, href }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" class="social-link">
          {label}
        </a>
      ))}
    </div>
  );
}
