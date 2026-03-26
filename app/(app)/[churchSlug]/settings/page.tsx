import { redirect } from 'next/navigation'

interface Props { params: { churchSlug: string } }

export default function SettingsPage({ params }: Props) {
  redirect(`/${params.churchSlug}/settings/my-setup/flows`)
}
