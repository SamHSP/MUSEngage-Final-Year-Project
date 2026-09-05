import { Helmet } from 'react-helmet-async';

type SeoProps = {
  title: string;
  description: string;
  canonical?: string;
  noindex?: boolean;
};

// Provides consistent SEO metadata across application routes.
export default function Seo({ title, description, canonical, noindex }: SeoProps) {
  const robotsValue = noindex ? 'noindex, nofollow' : undefined;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {robotsValue ? <meta name="robots" content={robotsValue} /> : null}
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Helmet>
  );
}
