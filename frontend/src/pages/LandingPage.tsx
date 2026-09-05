import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Grid from '@mui/material/GridLegacy';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';

const teamMembers = [
  {
    role: 'Lead Developer',
    name: 'Kim Andrew Dela Cruz',
    linkedin: 'https://www.linkedin.com/in/kim-andrew-dela-cruz-808b9618a/',
    description:'Architected the system architecture, and Implemented the application from front to back and handled all deployment processes, ensuring a reliable and fully functioning system.',
  },
  {
    role: 'Project Manager',
    name: 'Brendan Wee Chern Lung',
    linkedin: 'http://www.linkedin.com/in/bwcl2',
    description: 'Managed project timelines, stakeholder expectations, and team coordination to ensure efficient delivery and alignment with project goals',
  },
  {
    role: 'Documentation Officer',
    name: 'Adrian, Aung Phone Myat',
    linkedin: 'https://www.linkedin.com/in/aungphonemyat12',
    description: 'Maintained project documentation, ensuring clarity and consistency for ongoing development.',
  },
  {
    role: 'Deputy Project Lead',
    name: 'Jacob Ryan Han',
    linkedin: 'https://www.linkedin.com/',
    description: 'Supported strategic decisions and bridged communication between engineering and product goals.',
  },
  {
    role: 'Data Protection Officer',
    name: 'Dwain Jun Han Lee',
    linkedin: 'https://www.linkedin.com/',
    description: 'Oversaw data governance, privacy safeguards, and compliance for user information.',
  },
  {
    role: 'Quality Assurance Officer',
    name: 'Samuel, Si Thu Htet',
    linkedin: 'https://www.linkedin.com/',
    description: 'Led testing efforts to uphold reliability, performance, and user trust in every release.',
  },
];

const LandingPage = () => {
  const { user } = useAuth();
  const homeRoute = user?.role === 'guest' ? '/events' : '/dashboard';

  return (
    <Box sx={{ bgcolor: 'background.default', color: 'text.primary' }}>
      <PageHero
        eyebrow="Murdoch University"
        title="Welcome to MUSEngage"
        description="A central hub to discover events, build community, and celebrate every milestone in your student journey."
        theme="dashboard"
        // ctaLabel={user ? 'Go to dashboard' : 'Signup'}
        // ctaHref={user ? homeRoute : '/signup'}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 8, md: 10 } }}>
        <Grid container spacing={{ xs: 6, md: 4 }} component="div">
          <Grid item xs={12} md={6} component="div">
            <Stack spacing={3}>
              <Typography variant="overline" color="primary.main">
                Brief description
              </Typography>
              <Typography variant="h3" component="h2">
                About MUSEngage
              </Typography>
              <Stack spacing={2}>
                <Typography variant="body1" color="text.secondary">
                  MUSEngage is Murdoch University Singapore’s engagement platform, to help bring students closer to campus
                  life. The app centralizes events, opportunities, community interactions, and campus services into one
                  simple, mobile-friendly experience.
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  MUSEngage gives students a complete set of tools including event participation, QR check-ins, reward
                  points, polls, competitions, community forums, feedback and facility reporting, timetable integration,
                  and access to the official Murdoch merchandise store.
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Guests can browse events and shop for merchandise, with limited access to interactive features.
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  So come and explore MUSEngage today
                </Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {user ? (
                  <Button variant="contained" color="secondary" size="large" href={homeRoute}>
                    Go to dashboard
                  </Button>
                ) : (
                  <>
                  <Button variant="contained" color="secondary" size="large" href="/login">
                    Login
                  </Button>
                  <Button variant="contained" color="secondary" size="large" href="/signup">
                    Signup
                  </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </Grid>

          <Grid item xs={12} md={6} component="div">
            <Box
              component="img"
              src="/MUSEngage_red.png"
              alt="MUSEngage logo"
              sx={{
                width: '100%',
                maxWidth: 520,
                display: 'block',
                ml: { xs: 'auto', md: 'auto' },
                mr: { xs: 'auto', md: 0 },
                borderRadius: 3,
                boxShadow: (theme) => theme.shadows[8],
              }}
            />
          </Grid>

        </Grid>

        <Box sx={{ mt: { xs: 10, md: 12 } }}>
          <Stack spacing={2} textAlign="center">
            <Typography variant="overline" color="primary.main">
              Meet the Team
            </Typography>
            <Typography variant="h3" component="h2">
              The people behind MUSEngage
            </Typography>
            <Typography variant="body1" color="text.secondary"  >
              A dedicated group of collaborators bringing the platform to life, a team based from Murdoch University Singapore.
            </Typography>
          </Stack>
          <Box
              component="img"
              src="/nautilus-clear.png"
              alt="nautilus logo"
              sx={{
                width: '100%',
                maxWidth: 520,
                display: 'block',
                mx: 'auto',
                mt: 5,
                borderRadius: 3,
                boxShadow: (theme) => theme.shadows[8],
              }}
            />


          <Grid container spacing={3} sx={{ mt: 4 }} alignItems="stretch" component="div">
            {teamMembers.map((member) => (
              <Grid item xs={12} sm={6} md={4} key={member.role} sx={{ display: 'flex' }} component="div">
                <Card
                  variant="outlined"
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    borderColor: (theme) => alpha(theme.palette.primary.dark, 0.12),
                    background: (theme) => alpha(theme.palette.primary.light, 0.05),
                  }}
                >
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                    <Stack spacing={2} sx={{ flexGrow: 1 }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar sx={{ bgcolor: 'secondary.main' }}>{member.name.charAt(0)}</Avatar>
                        <Box>
                          <Typography variant="subtitle2" color="primary.main" textTransform="uppercase">
                            {member.role}
                          </Typography>
                          <Typography variant="h6">
                            {member.name} |{' '}
                            <Link
                              href={member.linkedin}
                              target="_blank"
                              rel="noreferrer"
                              underline="hover"
                              color="inherit"
                            >
                              LinkedIn
                            </Link>
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {member.description}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
