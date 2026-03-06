
import type { Person } from '../../domain/people/types';
import { MOCK_PEOPLE } from '../mockData';

export class PeopleRepo {
  getAll(ecosystemId?: string): Person[] {
    if (ecosystemId) {
      return MOCK_PEOPLE.filter(p => p.memberships?.some(m => m.ecosystem_id === ecosystemId));
    }
    return MOCK_PEOPLE;
  }

  getById(id: string): Person | undefined {
    return MOCK_PEOPLE.find(p => p.id === id);
  }

  add(person: Person): void {
    MOCK_PEOPLE.push(person);
  }

  update(id: string, updates: Partial<Person>): void {
    const person = this.getById(id);
    if (person) {
        Object.assign(person, updates);
    }
  }
}
