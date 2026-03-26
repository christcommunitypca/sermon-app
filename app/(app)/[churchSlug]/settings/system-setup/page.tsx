import { redirect } from 'next/navigation'

interface Props { params: { churchSlug: string } }

export default function SystemSetupPage({ params }: Props) {
  redirect(`/${params.churchSlug}/settings/system-setup/users`)
}
