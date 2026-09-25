
import type { Person } from '../../domain/people/types';
import type { ViewerContext } from '../../domain/access/policy';
import type { NetworkViewSource } from '../networkView';
import { MOCK_PEOPLE } from '../mockData';

export class PeopleRepo {
  constructor(private networkView: NetworkViewSource) {}

  /** People visible to the viewer: colleagues, people their org works with, and directory listings. */
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Person[]> {
    return (await this.networkView.get(viewer, ecosystemId)).people;
  }

  /** Demo only: the persona list used by the "switch user" menu and demo sign-in. */
  async getAllDemoPersonas(): Promise<Person[]> {
    return MOCK_PEOPLE;
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
