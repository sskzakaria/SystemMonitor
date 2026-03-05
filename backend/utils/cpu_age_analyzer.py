"""
CPU Age Analyzer Utility
Analyzes CPU model strings to determine approximate age and generation.
This is the backend version that matches the frontend implementation.
"""

from datetime import datetime
from typing import Optional, Dict, Any
import re


class CPUAgeInfo:
    """CPU age information structure"""
    def __init__(self, age: Optional[int] = None, generation: Optional[str] = None, 
                 release_year: Optional[int] = None):
        self.age = age
        self.generation = generation
        self.release_year = release_year
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            'cpu_age_years': self.age,
            'cpu_generation': self.generation,
            'cpu_release_year': self.release_year
        }


def analyze_cpu_age(cpu_model: Optional[str]) -> CPUAgeInfo:
    """
    Extract generation/year information from CPU model string.
    
    Args:
        cpu_model: CPU model string (e.g., "Intel Core i7-9700K")
    
    Returns:
        CPUAgeInfo object with age, generation, and release year
    """
    if not cpu_model:
        return CPUAgeInfo()
    
    current_year = datetime.now().year
    release_year: Optional[int] = None
    generation: Optional[str] = None
    
    model = cpu_model.lower()
    
    # Intel CPU detection
    if 'intel' in model:
        # 14th Gen (2023-2024)
        if re.search(r'i[3579]-14\d{3}', model):
            release_year = 2023
            generation = '14th Gen'
        # 13th Gen (2022-2023)
        elif re.search(r'i[3579]-13\d{3}', model):
            release_year = 2022
            generation = '13th Gen'
        # 12th Gen (2021-2022)
        elif re.search(r'i[3579]-12\d{3}', model):
            release_year = 2021
            generation = '12th Gen'
        # 11th Gen (2020-2021)
        elif re.search(r'i[3579]-11\d{3}', model):
            release_year = 2020
            generation = '11th Gen'
        # 10th Gen (2019-2020)
        elif re.search(r'i[3579]-10\d{3}', model):
            release_year = 2019
            generation = '10th Gen'
        # 9th Gen (2018-2019)
        elif re.search(r'i[3579]-9\d{3}', model):
            release_year = 2018
            generation = '9th Gen'
        # 8th Gen (2017-2018)
        elif re.search(r'i[3579]-8\d{3}', model):
            release_year = 2017
            generation = '8th Gen'
        # 7th Gen (2016-2017)
        elif re.search(r'i[3579]-7\d{3}', model):
            release_year = 2016
            generation = '7th Gen'
        # 6th Gen (2015-2016)
        elif re.search(r'i[3579]-6\d{3}', model):
            release_year = 2015
            generation = '6th Gen'
        # 5th Gen (2014-2015)
        elif re.search(r'i[3579]-5\d{3}', model):
            release_year = 2014
            generation = '5th Gen'
        # 4th Gen (2013-2014)
        elif re.search(r'i[3579]-4\d{3}', model):
            release_year = 2013
            generation = '4th Gen'
        # 3rd Gen (2012-2013)
        elif re.search(r'i[3579]-3\d{3}', model):
            release_year = 2012
            generation = '3rd Gen'
    
    # AMD Ryzen detection
    elif 'ryzen' in model:
        # Ryzen 7000 Series (2022-2023)
        if re.search(r'ryzen.*7\d{3}', model):
            release_year = 2022
            generation = 'Ryzen 7000'
        # Ryzen 6000 Series (2022)
        elif re.search(r'ryzen.*6\d{3}', model):
            release_year = 2022
            generation = 'Ryzen 6000'
        # Ryzen 5000 Series (2020-2021)
        elif re.search(r'ryzen.*5\d{3}', model):
            release_year = 2020
            generation = 'Ryzen 5000'
        # Ryzen 4000 Series (2020)
        elif re.search(r'ryzen.*4\d{3}', model):
            release_year = 2020
            generation = 'Ryzen 4000'
        # Ryzen 3000 Series (2019)
        elif re.search(r'ryzen.*3\d{3}', model):
            release_year = 2019
            generation = 'Ryzen 3000'
        # Ryzen 2000 Series (2018)
        elif re.search(r'ryzen.*2\d{3}', model):
            release_year = 2018
            generation = 'Ryzen 2000'
        # Ryzen 1000 Series (2017)
        elif re.search(r'ryzen.*1\d{3}', model):
            release_year = 2017
            generation = 'Ryzen 1000'
    
    # Calculate age
    age = (current_year - release_year) if release_year else None
    
    return CPUAgeInfo(age=age, generation=generation, release_year=release_year)


def get_cpu_age_category(age: Optional[int]) -> str:
    """
    Categorize CPU age for filtering.
    
    Args:
        age: CPU age in years
    
    Returns:
        Category string: 'new', 'recent', 'aging', 'old', 'unknown'
    """
    if age is None:
        return 'unknown'
    elif age <= 2:
        return 'new'
    elif age <= 4:
        return 'recent'
    elif age <= 6:
        return 'aging'
    else:
        return 'old'
