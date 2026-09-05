import { Button, Container, Divider, List, ListItem, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import Seo from '../components/Seo';
import PageHero from '../components/PageHero';

type PolicySection = {
  title: string;
  description?: string;
  bullets?: string[];
};

const POLICY_SECTIONS: PolicySection[] = [
  {
    title: 'Information we collect',
    description:
      'We collect the minimum personal data required to deliver campus engagement services. This includes the name, Murdoch University email address and password you provide during registration, optional profile details, and activity data such as event RSVPs, rewards redemptions, feedback submissions and community posts.',
  },
  {
    title: 'How we use your information',
    bullets: [
      'Provide access to MUSEngage features, including events, rewards and community spaces.',
      'Authenticate your identity and maintain secure sessions.',
      'Deliver notifications, reminders and service announcements you have opted in to receive.',
      'Analyse platform usage to improve student services and ensure PDPA compliance.',
    ],
  },
  {
    title: 'Retention and protection',
    description:
      'Your personal data is stored on secure infrastructure with strict access controls, encryption at rest and in transit, and routine monitoring for unauthorised activity. We retain personal data only as long as necessary to provide services or as required by law, after which it is securely deleted.',
  },
  {
    title: 'Your PDPA rights',
    bullets: [
      'Request a copy of the personal data we hold about you via the "Download My Data" option on your account page.',
      'Correct inaccurate personal information by updating your profile or contacting the support team.',
      'Withdraw consent and request deletion of your account and associated personal data at any time.',
      'Opt out of non-essential notifications or marketing communications.',
    ],
  },
  {
    title: 'Contact us',
    description:
      'For privacy enquiries or to exercise any PDPA rights, please email support@musengage.site or speak with the Murdoch University Singapore student services office. We will acknowledge and respond to all verified requests within 21 calendar days.',
  },
];

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <Seo
        title="Privacy Policy — MUSEngage"
        description="Learn how MUSEngage collects, uses and protects your personal data in accordance with Singapore PDPA requirements."
        canonical="https://musengage.site/privacy-policy"
      />
      <PageHero
        eyebrow="Privacy"
        title="MUSEngage Privacy Policy"
        description="This policy explains how we collect, use, store and safeguard personal data on the MUSEngage platform, and the PDPA rights available to you."
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
          {POLICY_SECTIONS.map((section) => (
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
            By continuing to use MUSEngage, you acknowledge that you have read and understood this Privacy Policy and
            consent to the processing of your personal data as described above.
          </Typography>
        </Stack>
      </Container>
    </>
  );
};

export default PrivacyPolicyPage;
