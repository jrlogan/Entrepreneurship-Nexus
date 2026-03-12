const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const sharedPassword = process.env.TEST_USERS_PASSWORD || 'Password123!';

const accounts = [
  {
    label: 'platform_admin',
    email: 'coach@makehaven.org',
    first_name: 'Platform',
    last_name: 'Admin',
    system_role: 'platform_admin',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
  },
  {
    label: 'ecosystem_manager',
    email: 'ecosystem.admin@newhaven.example.org',
    first_name: 'Ecosystem',
    last_name: 'Manager',
    system_role: 'ecosystem_manager',
    organization_id: '',
    ecosystem_id: 'eco_new_haven',
  },
  {
    label: 'eso_admin_makehaven',
    email: 'eso.admin@makehaven.org',
    first_name: 'MakeHaven',
    last_name: 'Admin',
    system_role: 'eso_admin',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
  },
  {
    label: 'eso_staff_makehaven',
    email: 'eso.staff@makehaven.org',
    first_name: 'MakeHaven',
    last_name: 'Staff',
    system_role: 'eso_staff',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
  },
  {
    label: 'eso_coach_makehaven',
    email: 'eso.coach@makehaven.org',
    first_name: 'MakeHaven',
    last_name: 'Coach',
    system_role: 'eso_coach',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
  },
  {
    label: 'eso_admin_cti',
    email: 'eso.admin@ctinnovations.org',
    first_name: 'CTI',
    last_name: 'Admin',
    system_role: 'eso_admin',
    organization_id: 'org_ct_innovations',
    ecosystem_id: 'eco_new_haven',
  },
  {
    label: 'entrepreneur',
    email: 'founder@darkstarmarine.com',
    first_name: 'Casey',
    last_name: 'Founder',
    system_role: 'entrepreneur',
    organization_id: 'org_darkstar',
    ecosystem_id: 'eco_new_haven',
  },
];

const createAccount = async (account) => {
  const response = await fetch(`${baseUrl}/createTestAccount`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...account,
      password: sharedPassword,
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error || `Unable to seed account ${account.email}`);
  }

  return {
    label: account.label,
    email: account.email,
    password: sharedPassword,
    system_role: account.system_role,
    organization_id: account.organization_id || '(none)',
  };
};

const results = [];
for (const account of accounts) {
  results.push(await createAccount(account));
}

console.log(JSON.stringify({ ok: true, accounts: results }, null, 2));
