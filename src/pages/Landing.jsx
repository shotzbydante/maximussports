/**
 * Landing — root route ("/") for maximussports.ai.
 *
 * Guests get the marketing landing page; signed-in users get the home hub.
 */

import { useAuth } from '../context/AuthContext';
import GuestLanding from './landing/GuestLanding';
import MemberHome from './landing/MemberHome';

export default function Landing() {
  const { user, loading } = useAuth();
  // Hold the dark frame while auth resolves so a guest never sees the app
  // shell flash before the landing page.
  if (loading) return <div style={{ minHeight: '100vh', width: '100%', background: '#040a1a' }} />;
  if (!user) return <GuestLanding />;
  return <MemberHome />;
}
