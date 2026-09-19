import { Suspense } from "react";
import { PeopleList } from "@/components/people/PeopleList";

export const metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <Suspense>
      <PeopleList />
    </Suspense>
  );
}
