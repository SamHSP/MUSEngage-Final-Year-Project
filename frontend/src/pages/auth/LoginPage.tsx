import { Helmet } from 'react-helmet-async';
import Login from './components/LoginForm';

// Wraps the login form for routing purposes.
function LoginPage() {
  return (
    <>
      <Helmet>
        <title>MUSEngage | Sign in</title>
        <meta
          name="description"
          content="Access your MUSEngage account to explore events, rewards and campus engagement opportunities."
        />
      </Helmet>
      <Login />
    </>
  );
}

export default LoginPage;
