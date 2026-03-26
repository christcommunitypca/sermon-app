import { redirect } from 'next/navigation'

interface Props { params: { churchSlug: string } }

export default function ChurchSetupPage({ params }: Props) {
  redirect(`/${params.churchSlug}/settings/church-setup/flows`)
}
