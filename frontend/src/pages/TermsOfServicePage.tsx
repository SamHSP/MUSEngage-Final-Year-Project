import { Button, Container, Divider, List, ListItem, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import Seo from '../components/Seo';
import PageHero from '../components/PageHero';

type TermsSection = {
  title: string;
  description?: string;
  bullets?: string[];
};

const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'Acceptance of terms',
    description:
      'By accessing or using MUSEngage you agree to comply with these Terms of Service and all applicable laws. If you do not agree, do not create an account or continue using the platform.',
  },
  {
    title: 'Your responsibilities',
    bullets: [
      'Provide accurate information during registration and keep your credentials secure.',
      'Use the platform respectfully and comply with campus conduct policies when posting content or interacting with others.',
      'Do not misuse the service, attempt to access accounts that are not yours, or interfere with the security of the platform.',
      'Obtain permission before sharing personal data belonging to other individuals.',
    ],
  },
  {
    title: 'Platform availability',
    description:
      'We strive to maintain continuous access to MUSEngage but may suspend or modify features for maintenance, security or legal compliance. We are not liable for any loss resulting from downtime or service interruptions beyond our reasonable control.',
  },
  {
    title: 'Content guidelines',
    bullets: [
      'You are responsible for the content you publish. Keep posts accurate, respectful and relevant to the student community.',
      'We may remove content that violates policies or Singapore law, including defamatory, discriminatory or unlawful material.',
      'User-generated content may be moderated or archived to protect the community and comply with PDPA obligations.',
    ],
  },
  {
    title: 'Termination',
    description:
      'We may suspend or terminate access where policies are breached or required by law. You may delete your account at any time using the tools provided in the Account page, which will also anonymise associated data in compliance with PDPA.',
  },
  {
    title: 'Updates to these terms',
    description:
      'We may revise these Terms of Service periodically. Material changes will be communicated through in-app notifications or email, and continued use of MUSEngage after the effective date constitutes acceptance of the updated terms.',
  },
  {
    title: 'Contact',
    description:
      'Questions about these terms can be directed to support@musengage.site or the Murdoch University Singapore student services office.',
  },
];

const TermsOfServicePage = () => {
  const navigate = useNavigate();

  return (
    <>
      <Seo
        title="Terms of Service — MUSEngage"
        description="Review the terms and conditions for using the MUSEngage student engagement platform."
        canonical="https://musengage.site/terms-of-service"
      />
      <PageHero
        eyebrow="Terms"
        title="MUSEngage Terms of Service"
        description="These terms outline the acceptable use of MUSEngage, user responsibilities, and the policies that keep our community safe."
        theme="neutral"
      />
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
        <Button
          onClick={() => navigate(-1)}
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          sx={{ mb: 4 }}
        >
          Back 
        </Button>
        <Stack spacing={6} component="article">
          <Typography variant="body2" color="text.secondary">
            Last updated: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
          {TERMS_SECTIONS.map((section) => (
            <Stack key={section.title} spacing={2}>
              <Stack spacing={1}>
                <Typography variant="h4" component="h2">
                  {section.title}
                </Typography>
                {section.description ? (
                  <Typography variant="body1" color="text.secondary">
                    {section.description}
                  </Typography>
                ) : null}
              </Stack>
              {section.bullets ? (
                <List sx={{ listStyle: 'disc', pl: 3 }}>
                  {section.bullets.map((item) => (
                    <ListItem key={item} sx={{ display: 'list-item', pl: 1 }}>
                      <Typography variant="body1" color="text.secondary">
                        {item}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              ) : null}
              <Divider />
            </Stack>
          ))}
          <Typography variant="body2" color="text.secondary">
            By creating an account or continuing to use MUSEngage you confirm that you understand and accept these Terms of Service.
          </Typography>
        </Stack>
      </Container>
    </>
  );
};

export default TermsOfServicePage;
