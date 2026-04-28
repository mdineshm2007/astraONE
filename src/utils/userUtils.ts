const EMAIL_NAME_MAP: Record<string, string> = {
  '727724eumc054@skcet.ac.in': 'Kanishka',
  '727724eumc036@skcet.ac.in': 'Haresh Kumar',
  '727724eumc011@skcet.ac.in': 'Asma',
  '727725eumc604@skcet.ac.in': 'Harish',
  '727724eumc044@skcet.ac.in': 'Janani',
  '25mz096@skcet.ac.in': 'Yugesh',
  '727724eumc114@skcet.ac.in': 'Siddarthan',
  '25mz021@skcet.ac.in': 'Sanjeevi',
  '25mz045@skcet.ac.in': 'Rishi Karthick',
  '727724eumc093@skcet.ac.in': 'Sanjay',
  '25mz122@skcet.ac.in': 'Dinesh',
  '727724eumc026@skcet.ac.in': 'Dheeshith',
  '727725eumc608@skcet.ac.in': 'Nitheesh'
};

export function resolveNameFromEmail(email: string): string {
  if (!email) return 'Unknown';
  const e = email.toLowerCase().trim();
  
  // Check mapping first
  if (EMAIL_NAME_MAP[e]) return EMAIL_NAME_MAP[e];
  
  // Fallback: Extract from email (e.g. 727724eumc122@skcet.ac.in -> 727724eumc122)
  const part = email.split('@')[0];
  // Capitalize first letter of any text part
  return part.charAt(0).toUpperCase() + part.slice(1);
}
