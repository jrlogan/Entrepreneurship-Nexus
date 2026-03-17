
import type { Person } from '../../domain/people/types';
import { MOCK_PEOPLE } from '../mockData';

export class PeopleRepo {
  async getAll(ecosystemId?: string): Promise<Person[]> {
    if (ecosystemId) {
      return Promise.resolve(MOCK_PEOPLE.filter(p => p.memberships?.some(m => m.ecosystem_id === ecosystemId)));
    }
    return Promise.resolve(MOCK_PEOPLE);
  }

  async getById(id: string): Promise<Person | undefined> {
    return Promise.resolve(MOCK_PEOPLE.find(p => p.id === id));
  }

  async add(person: Person): Promise<void> {
    MOCK_PEOPLE.push(person);
    return Promise.resolve();
  }

  async update(id: string, updates: Partial<Person>): Promise<void> {
    const person = MOCK_PEOPLE.find(p => p.id === id);
    if (person) {
        Object.assign(person, updates);
    }
    return Promise.resolve();
  }

  async archive(id: string): Promise<void> {
    return this.update(id, { status: 'revoked' });
  }

  async delete(id: string): Promise<void> {
    const index = MOCK_PEOPLE.findIndex(p => p.id === id);
    if (index >= 0) MOCK_PEOPLE.splice(index, 1);
    return Promise.resolve();
  }
}
